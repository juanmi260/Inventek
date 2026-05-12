import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface ToastInput {
  id?: string;
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastItem extends ToastInput {
  id: string;
}

type Listener = (t: ToastInput) => void;
let listener: Listener | null = null;

export function showToast(t: ToastInput) {
  listener?.(t);
}

const Ctx = createContext<{ toasts: ToastItem[]; dismiss: (id: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    listener = (t) => {
      const id = t.id ?? Math.random().toString(36).slice(2);
      const item: ToastItem = { ...t, id };
      setToasts((prev) => [...prev, item]);
      const dur = t.durationMs ?? 3500;
      if (dur > 0) {
        setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), dur);
      }
    };
    return () => {
      listener = null;
    };
  }, []);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((x) => x.id !== id));

  return (
    <Ctx.Provider value={{ toasts, dismiss }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto flex max-w-md flex-col gap-2 px-3 sm:bottom-6"
        role="region"
        aria-live="polite"
        aria-label="Notificaciones"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto animate-fade-in rounded-lg border bg-surface p-3 shadow-card',
              'flex items-start gap-3',
              t.variant === 'success' && 'border-success/40',
              t.variant === 'warning' && 'border-warning/40',
              t.variant === 'danger' && 'border-danger/40',
              !t.variant && 'border-border',
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{t.title}</div>
              {t.description && <div className="mt-0.5 text-sm text-muted">{t.description}</div>}
            </div>
            {t.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
                className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-fg"
              >
                {t.actionLabel}
              </button>
            )}
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => dismiss(t.id)}
              className="text-muted hover:text-text"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToasts() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToasts outside ToastProvider');
  return v;
}
