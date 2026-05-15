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
import type { DataConnection } from 'peerjs';
import {
  attachProtocol,
  createPeerManager,
  stablePeerIdForDevice,
  type ManagerEvent,
  type PeerManager,
  type SyncEvent,
} from '@/platform/p2pSync';
import {
  getKnownReplicas,
  getPrimary,
  isPrimary,
  markSyncCompleted,
  recordPrimaryFingerprint,
  rememberReplica,
  getLastSyncAt,
  type PrimaryInfo,
} from '@/domain/use-cases/primary';
import { getDeviceId } from '@/platform/device';
import { db } from '@/data/db';
import type { SyncEvent as DomainSyncEvent } from '@/domain/entities';
import { useLock } from './lock';

const AUTO_SYNC_DEBOUNCE_MS = 2000;
const PEER_UNAVAILABLE_TIMEOUT_MS = 8000;

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
  /** Local peer-id (visible in /sync as the QR target). */
  myPeerId: string | null;
  /** Show the local QR-target UI. The Peer is already listening anyway. */
  showQr: () => void;
  /** Initiate a sync to a specific peer-id. */
  connect: (peerId: string) => void;
  /** Cancel a visible UI session. The persistent Peer is not destroyed. */
  cancel: () => void;
  /**
   * If we know about a primary, connect to it; if we are the primary,
   * push to known replicas; otherwise no-op.
   */
  syncWithPrimary: () => Promise<boolean>;
  /** Reload primary / lastSyncAt info from settings (after a sync). */
  refresh: () => Promise<void>;
}

const Ctx2 = createContext<Ctx | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<SyncProgress>(INITIAL);
  const [primary, setPrimary] = useState<PrimaryInfo | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);

  const managerRef = useRef<PeerManager | null>(null);
  const activeConnRef = useRef<DataConnection | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const { locked, hasPin } = useLock();
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const autoTriedRef = useRef(false);

  const refresh = useCallback(async () => {
    const [p, host, last] = await Promise.all([getPrimary(), isPrimary(), getLastSyncAt()]);
    setPrimary(p);
    setIsHost(host);
    setLastSyncAt(last);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Translate protocol events into UI state.
  const handleProtocolEvent = useCallback(
    (e: SyncEvent, opts: { remotePeerId?: string } = {}) => {
      if (e.type === 'connecting') {
        setProgress((p) => ({ ...p, phase: 'connecting' }));
      } else if (e.type === 'connected') {
        setProgress((p) => ({ ...p, phase: 'connected', otherDeviceId: e.otherDeviceId }));
        // Remember this peer so we can push back to it later. Only the *host*
        // truly needs to remember replicas, but everyone records who they've
        // talked to — cheap and useful for diagnostics.
        if (opts.remotePeerId) {
          void rememberReplica(e.otherDeviceId, opts.remotePeerId);
        }
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
          await recordPrimaryFingerprint(e.otherFingerprint);
          await markSyncCompleted();
          await refresh();
        })();
      } else if (e.type === 'peer-unavailable') {
        setProgress((p) => ({ ...p, phase: 'peer-unavailable' }));
      } else if (e.type === 'error') {
        setProgress((p) => ({ ...p, phase: 'error', errorMessage: e.message }));
      } else if (e.type === 'closed') {
        setProgress((p) =>
          p.phase === 'done' || p.phase === 'error' || p.phase === 'peer-unavailable'
            ? p
            : { ...p, phase: 'idle' },
        );
        activeConnRef.current = null;
      }
    },
    [refresh],
  );

  // Initiate an outgoing sync to a peer-id via the persistent Peer.
  const connect = useCallback(
    (peerId: string) => {
      const m = managerRef.current;
      if (!m) return;
      // Close a previous active outgoing connection (if any) before starting.
      try {
        activeConnRef.current?.close();
      } catch {
        // ignore
      }
      activeConnRef.current = null;
      setProgress({ ...INITIAL, phase: 'connecting' });
      let opened = false;
      const conn = m.connect(peerId);
      activeConnRef.current = conn;
      // PeerJS reports "could not connect to peer" via the connection's error
      // event in some cases and through the Peer's 'error' otherwise. Belt
      // and braces: catch both and a timeout fallback.
      const timeout = setTimeout(() => {
        if (!opened) {
          handleProtocolEvent({ type: 'peer-unavailable', peerId });
          try {
            conn.close();
          } catch {
            // ignore
          }
          if (activeConnRef.current === conn) activeConnRef.current = null;
        }
      }, PEER_UNAVAILABLE_TIMEOUT_MS);
      conn.on('open', () => {
        opened = true;
        clearTimeout(timeout);
        attachProtocol(conn, (e) => handleProtocolEvent(e, { remotePeerId: peerId }));
      });
      conn.on('error', (err: Error & { type?: string }) => {
        clearTimeout(timeout);
        if (err.type === 'peer-unavailable' || /could not connect to peer/i.test(err.message ?? '')) {
          handleProtocolEvent({ type: 'peer-unavailable', peerId });
        } else {
          handleProtocolEvent({ type: 'error', message: err.message });
        }
      });
    },
    [handleProtocolEvent],
  );

  const showQr = useCallback(() => {
    if (managerRef.current?.myPeerId()) {
      setProgress((p) => ({ ...p, phase: 'waiting', peerId: managerRef.current!.myPeerId() ?? p.peerId }));
    } else {
      setProgress((p) => ({ ...p, phase: 'opening' }));
    }
  }, []);

  const cancel = useCallback(() => {
    // The persistent Peer must stay alive (replicas can keep connecting). We
    // only close the active outgoing connection and reset the visible state.
    try {
      activeConnRef.current?.close();
    } catch {
      // ignore
    }
    activeConnRef.current = null;
    setProgress(INITIAL);
  }, []);

  const syncWithPrimary = useCallback(async () => {
    const me = getDeviceId();
    const p = await getPrimary();
    if (!p) return false;
    if (p.deviceId === me) {
      // I'm the primary — push to known replicas.
      const replicas = await getKnownReplicas();
      if (replicas.length === 0) return false;
      // Trigger pushes sequentially. The connect() reuses the persistent
      // Peer and one outgoing connection at a time.
      for (const r of replicas) {
        // Skip if a sync is already in flight.
        const phase = progressRef.current.phase;
        if (
          phase === 'connecting' ||
          phase === 'connected' ||
          phase === 'syncing' ||
          phase === 'opening'
        ) {
          await new Promise<void>((resolve) => {
            const timer = setInterval(() => {
              const ph = progressRef.current.phase;
              if (ph !== 'connecting' && ph !== 'connected' && ph !== 'syncing' && ph !== 'opening') {
                clearInterval(timer);
                resolve();
              }
            }, 200);
          });
        }
        connect(r.peerId);
        // Wait until this push reaches a terminal state before kicking the next.
        await new Promise<void>((resolve) => {
          const timer = setInterval(() => {
            const ph = progressRef.current.phase;
            if (ph === 'done' || ph === 'error' || ph === 'peer-unavailable' || ph === 'idle') {
              clearInterval(timer);
              resolve();
            }
          }, 200);
        });
      }
      return true;
    } else {
      connect(p.peerId);
      return true;
    }
  }, [connect]);

  // Persistent Peer: open once at mount with our stable peer-id, stays alive
  // until the SyncProvider unmounts. Both incoming and outgoing connections
  // share this Peer.
  useEffect(() => {
    const stableId = stablePeerIdForDevice(getDeviceId());
    const m = createPeerManager(stableId);
    managerRef.current = m;
    const off = m.on((e: ManagerEvent) => {
      if (e.type === 'ready') {
        setMyPeerId(e.peerId);
      } else if (e.type === 'incoming') {
        // Run the protocol on the incoming connection. Record the remote's
        // peer-id so we can push to it later. We don't take over the visible
        // 'phase' (it could be idle on the receiver side); we still surface
        // the connected/syncing/done states for the UI.
        attachProtocol(e.conn, (ev) => handleProtocolEvent(ev, { remotePeerId: e.remotePeerId }));
      } else if (e.type === 'manager-error') {
        // Soft: log to console only. Reconnection is attempted automatically.
        console.warn('[sync] peer manager error:', e.message);
      }
    });
    return () => {
      off();
      m.destroy();
      managerRef.current = null;
      setMyPeerId(null);
    };
  }, [handleProtocolEvent]);

  // Auto-pair at app open: replicas connect to primary; primaries push to
  // known replicas. Either side is a one-shot best-effort.
  useEffect(() => {
    if (locked && hasPin) return;
    if (autoTriedRef.current) return;
    autoTriedRef.current = true;
    void syncWithPrimary();
  }, [locked, hasPin, syncWithPrimary]);

  // Auto-sync debounced: trigger syncWithPrimary 2s after the last local
  // change. Eventos aplicados desde un remoto se filtran por deviceId para
  // evitar bucles.
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
        return;
      }
      void syncWithPrimary();
    };

    const schedule = () => {
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(triggerNow, AUTO_SYNC_DEBOUNCE_MS);
    };

    const hook = (_primKey: unknown, obj: DomainSyncEvent) => {
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
      myPeerId,
      showQr,
      connect,
      cancel,
      syncWithPrimary,
      refresh,
    }),
    [progress, primary, isHost, lastSyncAt, myPeerId, showQr, connect, cancel, syncWithPrimary, refresh],
  );

  return <Ctx2.Provider value={value}>{children}</Ctx2.Provider>;
}

export function useSync(): Ctx {
  const ctx = useContext(Ctx2);
  if (!ctx) throw new Error('useSync outside SyncProvider');
  return ctx;
}
