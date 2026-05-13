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
import { settingsRepo } from '@/data/repositories';
import { hashPin, verifyPin, type PinHash } from '@/platform/crypto';

interface SecuritySettings {
  pin: PinHash | null;
  lockTimeoutMin: number; // 0 = disabled
  lockOnHidden: boolean; // lock when the page becomes hidden
}

const DEFAULT_SECURITY: SecuritySettings = {
  pin: null,
  lockTimeoutMin: 0,
  lockOnHidden: false,
};

const KEY = 'security';

interface LockCtx {
  locked: boolean;
  hasPin: boolean;
  lockTimeoutMin: number;
  lockOnHidden: boolean;
  setPin: (newPin: string, currentPin?: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  clearPin: (currentPin: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  unlock: (pin: string) => Promise<boolean>;
  lockNow: () => void;
  setLockTimeout: (min: number) => void;
  setLockOnHidden: (v: boolean) => void;
}

const Ctx = createContext<LockCtx | null>(null);

export function LockProvider({ children }: { children: ReactNode }) {
  const [security, setSecurity] = useState<SecuritySettings>(DEFAULT_SECURITY);
  // Start unlocked when no PIN is set; otherwise we'll lock right after
  // loading the stored security settings.
  const [locked, setLocked] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Load persisted security settings on first render.
  useEffect(() => {
    void settingsRepo.get<SecuritySettings>(KEY).then((stored) => {
      if (stored) {
        setSecurity({ ...DEFAULT_SECURITY, ...stored });
        if (stored.pin) setLocked(true);
      }
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((s: SecuritySettings) => {
    setSecurity(s);
    void settingsRepo.set(KEY, s);
  }, []);

  // Inactivity tracking.
  const resetTimer = useCallback(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    if (!security.pin || security.lockTimeoutMin <= 0 || locked) return;
    timerRef.current = window.setTimeout(
      () => setLocked(true),
      security.lockTimeoutMin * 60_000,
    );
  }, [security.pin, security.lockTimeoutMin, locked]);

  useEffect(() => {
    resetTimer();
    const events: (keyof DocumentEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
    ];
    const handler = () => resetTimer();
    for (const ev of events) document.addEventListener(ev, handler, { passive: true });
    return () => {
      for (const ev of events) document.removeEventListener(ev, handler);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  // Lock on visibilitychange when configured.
  useEffect(() => {
    if (!security.pin || !security.lockOnHidden) return;
    const onVis = () => {
      if (document.visibilityState === 'hidden') setLocked(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [security.pin, security.lockOnHidden]);

  const setPin = useCallback(
    async (newPin: string, currentPin?: string) => {
      if (newPin.length < 4) return { ok: false as const, reason: 'El PIN debe tener al menos 4 dígitos.' };
      if (security.pin) {
        if (!currentPin) return { ok: false as const, reason: 'Introduce tu PIN actual para cambiarlo.' };
        const ok = await verifyPin(currentPin, security.pin);
        if (!ok) return { ok: false as const, reason: 'PIN actual incorrecto.' };
      }
      const hash = await hashPin(newPin);
      persist({ ...security, pin: hash });
      return { ok: true as const };
    },
    [security, persist],
  );

  const clearPin = useCallback(
    async (currentPin: string) => {
      if (!security.pin) return { ok: true as const };
      const ok = await verifyPin(currentPin, security.pin);
      if (!ok) return { ok: false as const, reason: 'PIN incorrecto.' };
      persist({ ...security, pin: null });
      setLocked(false);
      return { ok: true as const };
    },
    [security, persist],
  );

  const unlock = useCallback(
    async (pin: string) => {
      if (!security.pin) {
        setLocked(false);
        return true;
      }
      const ok = await verifyPin(pin, security.pin);
      if (ok) {
        setLocked(false);
        resetTimer();
      }
      return ok;
    },
    [security.pin, resetTimer],
  );

  const lockNow = useCallback(() => {
    if (security.pin) setLocked(true);
  }, [security.pin]);

  const setLockTimeout = useCallback(
    (min: number) => persist({ ...security, lockTimeoutMin: min }),
    [security, persist],
  );

  const setLockOnHidden = useCallback(
    (v: boolean) => persist({ ...security, lockOnHidden: v }),
    [security, persist],
  );

  const value = useMemo<LockCtx>(
    () => ({
      locked: loaded && locked,
      hasPin: !!security.pin,
      lockTimeoutMin: security.lockTimeoutMin,
      lockOnHidden: security.lockOnHidden,
      setPin,
      clearPin,
      unlock,
      lockNow,
      setLockTimeout,
      setLockOnHidden,
    }),
    [loaded, locked, security, setPin, clearPin, unlock, lockNow, setLockTimeout, setLockOnHidden],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLock(): LockCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLock outside LockProvider');
  return ctx;
}
