import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { settingsRepo } from '@/data/repositories';

export interface AppSettings {
  currency: string;
  locale: string;
  scanSoundEnabled: boolean;
  scanVibrationEnabled: boolean;
  allowNegativeStock: boolean;
}

const DEFAULTS: AppSettings = {
  currency: 'EUR',
  locale: typeof navigator !== 'undefined' ? navigator.language : 'es-ES',
  scanSoundEnabled: false,
  scanVibrationEnabled: true,
  allowNegativeStock: false,
};

const KEY = 'app.settings';

interface Ctx {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);

  useEffect(() => {
    void settingsRepo.get<Partial<AppSettings>>(KEY).then((stored) => {
      if (stored) setSettings((s) => ({ ...s, ...stored }));
    });
  }, []);

  const update = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        void settingsRepo.set(KEY, next);
        return next;
      });
    },
    [],
  );

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings outside SettingsProvider');
  return ctx;
}
