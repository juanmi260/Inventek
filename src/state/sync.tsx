import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  connectToHost,
  startHost,
  stablePeerIdForDevice,
  type SyncEvent,
  type SyncSession,
} from '@/platform/p2pSync';
import {
  getPrimary,
  isPrimary,
  markSyncCompleted,
  recordPrimaryFingerprint,
  getLastSyncAt,
  type PrimaryInfo,
} from '@/domain/use-cases/primary';
import { getDeviceId } from '@/platform/device';
import { db } from '@/data/db';
import type { SyncEvent as DomainSyncEvent } from '@/domain/entities';
import { useLock } from './lock';

const AUTO_SYNC_DEBOUNCE_MS = 2000;

export type SyncPhase =
  | 'idle'
  | 'opening'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'done'
  | 'peer-unavailable'
  | 'error';

export interface SyncProgress {
  phase: SyncPhase;
  peerId?: string;
  otherDeviceId?: string;
  sent: number;
  received: number;
  applied: number;
  byEntity: Record<string, number>;
  errorMessage?: string;
}

const INITIAL: SyncProgress = {
  phase: 'idle',
  sent: 0,
  received: 0,
  applied: 0,
  byEntity: {},
};

interface Ctx {
  progress: SyncProgress;
  primary: PrimaryInfo | null;
  isHost: boolean;
  lastSyncAt: string | null;
  /** Start as host. If this device is the primary, uses its stable peer-id. */
  startHostMode: () => void;
  connect: (peerId: string) => void;
  cancel: () => void;
  /**
   * Convenience: if this device knows about a primary, connect to it; if this
   * device is the primary, open the listener. Used by both the auto-pair flow
   * and the manual "Sincronizar ahora" button.
   */
  syncWithPrimary: () => Promise<boolean>;
  /**
   * Forces the host listener to be (re)started with the current peer-id.
   * Use after promoting this device to primary, so replicas can find it via
   * the new stable peer-id immediately.
   */
  restartHost: () => Promise<void>;
  /** Reload primary info from settings (after a sync). */
  refresh: () => Promise<void>;
}

const Ctx2 = createContext<Ctx | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<SyncProgress>(INITIAL);
  const [primary, setPrimary] = useState<PrimaryInfo | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const sessionRef = useRef<SyncSession | null>(null);
  // Track the current session's role so cancel() and reconnect logic can
  // decide whether to keep the listener alive or fully destroy.
  const sessionModeRef = useRef<'idle' | 'host' | 'guest'>('idle');
  const hostPeerIdRef = useRef<string | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const { locked, hasPin } = useLock();
  const autoTriedRef = useRef(false);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const refresh = useCallback(async () => {
    const [p, host, last] = await Promise.all([getPrimary(), isPrimary(), getLastSyncAt()]);
    setPrimary(p);
    setIsHost(host);
    setLastSyncAt(last);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleEvent = useCallback(
    (e: SyncEvent) => {
      if (e.type === 'opening') {
        setProgress((p) => ({ ...p, phase: 'opening' }));
      } else if (e.type === 'peer-id') {
        setProgress((p) => ({ ...p, phase: 'waiting', peerId: e.peerId }));
      } else if (e.type === 'connecting') {
        setProgress((p) => ({ ...p, phase: 'connecting' }));
      } else if (e.type === 'connected') {
        setProgress((p) => ({ ...p, phase: 'connected', otherDeviceId: e.otherDeviceId }));
      } else if (e.type === 'exchanging-watermarks') {
        setProgress((p) => ({ ...p, phase: 'syncing' }));
      } else if (e.type === 'sending') {
        setProgress((p) => ({ ...p, sent: e.count }));
      } else if (e.type === 'receiving') {
        setProgress((p) => ({
          ...p,
          received: e.count,
          applied: e.applied,
          byEntity: e.byEntity,
        }));
      } else if (e.type === 'done') {
        setProgress((p) => ({
          ...p,
          phase: 'done',
          applied: e.applied,
          byEntity: e.byEntity,
        }));
        void (async () => {
          // If we just synced with the primary (or *we are* the primary syncing
          // with a replica), record the fingerprint so future promotion checks
          // can verify equality.
          await recordPrimaryFingerprint(e.otherFingerprint);
          await markSyncCompleted();
          await refresh();
        })();
      } else if (e.type === 'peer-unavailable') {
        // The primary isn't on the broker (likely: app not open). This is a
        // normal expected state, not an error. Tile in dashboard shows "Sin
        // conexión con el primario"; we don't toast.
        setProgress((p) => ({ ...p, phase: 'peer-unavailable' }));
      } else if (e.type === 'error') {
        setProgress((p) => ({ ...p, phase: 'error', errorMessage: e.message }));
      } else if (e.type === 'closed') {
        // Connection closed; if we're not in error/done yet, treat as graceful end.
        setProgress((p) =>
          p.phase === 'done' || p.phase === 'error' || p.phase === 'peer-unavailable'
            ? p
            : { ...p, phase: 'idle' },
        );
      }
    },
    [refresh],
  );

  const destroySession = useCallback(() => {
    sessionRef.current?.destroy();
    sessionRef.current = null;
    sessionModeRef.current = 'idle';
    hostPeerIdRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    // The primary's listener must stay alive across UI dismissals so replicas
    // can keep finding it. Cancel only resets the visible progress state.
    if (sessionModeRef.current === 'host') {
      setProgress((p) => ({
        ...INITIAL,
        // Preserve the peerId so the dashboard tile and /sync can still show
        // "Eres el primario · escuchando" instead of going blank.
        peerId: hostPeerIdRef.current ?? p.peerId,
      }));
      return;
    }
    destroySession();
    setProgress(INITIAL);
  }, [destroySession]);

  const startHostMode = useCallback(async () => {
    const host = await isPrimary();
    const desiredPeerId = host ? stablePeerIdForDevice(getDeviceId()) : undefined;
    // If we're already hosting and the desired peer-id matches what we're
    // listening on, do nothing (idempotent).
    if (
      sessionRef.current &&
      sessionModeRef.current === 'host' &&
      (!desiredPeerId || hostPeerIdRef.current === desiredPeerId)
    ) {
      return;
    }
    destroySession();
    hostPeerIdRef.current = desiredPeerId ?? null;
    setProgress({ ...INITIAL, phase: 'opening' });
    sessionRef.current = startHost(
      (e) => {
        // Capture the actually-assigned peer-id (matters when desiredPeerId
        // is undefined and the broker picked a random one).
        if (e.type === 'peer-id') hostPeerIdRef.current = e.peerId;
        handleEvent(e);
      },
      desiredPeerId ? { peerId: desiredPeerId } : {},
    );
    sessionModeRef.current = 'host';
  }, [destroySession, handleEvent]);

  const connect = useCallback(
    (peerId: string) => {
      destroySession();
      setProgress({ ...INITIAL, phase: 'opening' });
      sessionRef.current = connectToHost(peerId, handleEvent);
      sessionModeRef.current = 'guest';
    },
    [destroySession, handleEvent],
  );

  const syncWithPrimary = useCallback(async () => {
    const p = await getPrimary();
    const me = getDeviceId();
    if (!p) return false;
    if (p.deviceId === me) {
      void startHostMode();
    } else {
      connect(p.peerId);
    }
    return true;
  }, [startHostMode, connect]);

  const restartHost = useCallback(async () => {
    destroySession();
    await startHostMode();
  }, [destroySession, startHostMode]);

  // Auto-pair: when the app opens (unlocked), if this device knows about a
  // primary, attempt to connect once. On replica side, a "peer-unavailable"
  // outcome is fine — it just means the primary isn't online right now and
  // the user can retry manually from /sync or the dashboard tile.
  useEffect(() => {
    if (locked && hasPin) return;
    if (autoTriedRef.current) return;
    autoTriedRef.current = true;
    void syncWithPrimary();
  }, [locked, hasPin, syncWithPrimary]);

  // Auto-sync (debounced): after a local change is recorded in syncEvents,
  // wait AUTO_SYNC_DEBOUNCE_MS for any further changes and then trigger a
  // sync with the primary. Remote events applied via applyEvents have a
  // foreign deviceId and are filtered out so they don't cause loops.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const localDeviceId = getDeviceId();

    const triggerNow = () => {
      timer = null;
      if (lockedRef.current) return;
      const phase = progressRef.current.phase;
      if (
        phase === 'opening' ||
        phase === 'connecting' ||
        phase === 'connected' ||
        phase === 'syncing'
      ) {
        // A sync is already in flight; let it finish.
        return;
      }
      void syncWithPrimary();
    };

    const schedule = () => {
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(triggerNow, AUTO_SYNC_DEBOUNCE_MS);
    };

    const hook = (_primKey: unknown, obj: DomainSyncEvent) => {
      // The hook fires inside the transaction; defer scheduling so we don't
      // race with the transaction commit.
      if (obj.deviceId !== localDeviceId) return;
      setTimeout(schedule, 0);
    };

    db.syncEvents.hook('creating', hook);
    return () => {
      if (timer != null) clearTimeout(timer);
      db.syncEvents.hook('creating').unsubscribe(hook);
    };
  }, [syncWithPrimary]);

  const value = useMemo<Ctx>(
    () => ({
      progress,
      primary,
      isHost,
      lastSyncAt,
      startHostMode,
      connect,
      cancel,
      syncWithPrimary,
      restartHost,
      refresh,
    }),
    [
      progress,
      primary,
      isHost,
      lastSyncAt,
      startHostMode,
      connect,
      cancel,
      syncWithPrimary,
      restartHost,
      refresh,
    ],
  );

  return <Ctx2.Provider value={value}>{children}</Ctx2.Provider>;
}

export function useSync(): Ctx {
  const ctx = useContext(Ctx2);
  if (!ctx) throw new Error('useSync outside SyncProvider');
  return ctx;
}
