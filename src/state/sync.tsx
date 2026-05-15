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
import { useLock } from './lock';

export type SyncPhase =
  | 'idle'
  | 'opening'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'done'
  | 'error';

export interface SyncProgress {
  phase: SyncPhase;
  peerId?: string;
  otherDeviceId?: string;
  sent: number;
  received: number;
  applied: number;
  errorMessage?: string;
}

const INITIAL: SyncProgress = {
  phase: 'idle',
  sent: 0,
  received: 0,
  applied: 0,
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
  const { locked, hasPin } = useLock();
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
        setProgress((p) => ({ ...p, received: e.count, applied: e.applied }));
      } else if (e.type === 'done') {
        setProgress((p) => ({ ...p, phase: 'done' }));
        void (async () => {
          // If we just synced with the primary (or *we are* the primary syncing
          // with a replica), record the fingerprint so future promotion checks
          // can verify equality.
          await recordPrimaryFingerprint(e.otherFingerprint);
          await markSyncCompleted();
          await refresh();
        })();
      } else if (e.type === 'error') {
        setProgress((p) => ({ ...p, phase: 'error', errorMessage: e.message }));
      } else if (e.type === 'closed') {
        // Connection closed; if we're not in error/done yet, treat as graceful end.
        setProgress((p) => (p.phase === 'done' || p.phase === 'error' ? p : { ...p, phase: 'idle' }));
      }
    },
    [refresh],
  );

  const cancel = useCallback(() => {
    sessionRef.current?.destroy();
    sessionRef.current = null;
    setProgress(INITIAL);
  }, []);

  const startHostMode = useCallback(async () => {
    cancel();
    const host = await isPrimary();
    const peerId = host ? (await import('@/platform/p2pSync')).stablePeerIdForDevice(getDeviceId()) : undefined;
    setProgress({ ...INITIAL, phase: 'opening' });
    sessionRef.current = startHost(handleEvent, peerId ? { peerId } : {});
  }, [cancel, handleEvent]);

  const connect = useCallback(
    (peerId: string) => {
      cancel();
      setProgress({ ...INITIAL, phase: 'opening' });
      sessionRef.current = connectToHost(peerId, handleEvent);
    },
    [cancel, handleEvent],
  );

  // Auto-pair: when the app opens (unlocked), if this device is a replica
  // and has a recorded primary, attempt to connect once.
  useEffect(() => {
    if (locked && hasPin) return;
    if (autoTriedRef.current) return;
    autoTriedRef.current = true;
    void (async () => {
      const p = await getPrimary();
      const me = getDeviceId();
      if (!p) return;
      if (p.deviceId === me) {
        // I'm the primary — open my listener so replicas can find me.
        startHostMode();
      } else {
        // I'm a replica — try to connect to the primary once.
        connect(p.peerId);
      }
    })();
  }, [locked, hasPin, startHostMode, connect]);

  const value = useMemo<Ctx>(
    () => ({ progress, primary, isHost, lastSyncAt, startHostMode, connect, cancel, refresh }),
    [progress, primary, isHost, lastSyncAt, startHostMode, connect, cancel, refresh],
  );

  return <Ctx2.Provider value={value}>{children}</Ctx2.Provider>;
}

export function useSync(): Ctx {
  const ctx = useContext(Ctx2);
  if (!ctx) throw new Error('useSync outside SyncProvider');
  return ctx;
}
