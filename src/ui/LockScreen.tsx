import { useState } from 'react';
import { useLock } from '@/state/lock';
import { Lock, Delete } from 'lucide-react';
import { cn } from '@/utils/cn';

const KEYS: Array<{ value: string; label?: string }> = [
  { value: '1' },
  { value: '2' },
  { value: '3' },
  { value: '4' },
  { value: '5' },
  { value: '6' },
  { value: '7' },
  { value: '8' },
  { value: '9' },
];

const PIN_LENGTH = 6; // max — accepts 4–6 digit pins

export function LockScreen() {
  const { unlock } = useLock();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const append = (d: string) => {
    if (busy) return;
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    setError(null);
  };

  const backspace = () => {
    if (busy) return;
    setPin(pin.slice(0, -1));
    setError(null);
  };

  const tryUnlock = async (value: string) => {
    setBusy(true);
    const ok = await unlock(value);
    setBusy(false);
    if (!ok) {
      setError('PIN incorrecto');
      setPin('');
    }
  };

  // Auto-submit when length reaches typical pin sizes (4 then 5 then 6).
  // We attempt at length 4, 5 and 6 — the user just keeps typing if it
  // wasn't theirs.
  const onConfirm = () => {
    if (pin.length >= 4) void tryUnlock(pin);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bloqueado"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-bg p-6"
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <Lock size={36} className="text-primary" aria-hidden />
        <h1 className="text-lg font-semibold">Introduce tu PIN</h1>
        <div className="flex gap-2" aria-label={`PIN, ${pin.length} de ${PIN_LENGTH} dígitos`}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-3 w-3 rounded-full border',
                i < pin.length ? 'border-primary bg-primary' : 'border-border',
              )}
            />
          ))}
        </div>
        {error && <div className="text-sm text-danger">{error}</div>}
      </div>

      <div className="grid w-full max-w-xs grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <KeyButton key={k.value} onClick={() => append(k.value)} disabled={busy}>
            {k.value}
          </KeyButton>
        ))}
        <KeyButton onClick={onConfirm} disabled={pin.length < 4 || busy} variant="primary">
          OK
        </KeyButton>
        <KeyButton onClick={() => append('0')} disabled={busy}>
          0
        </KeyButton>
        <KeyButton onClick={backspace} disabled={busy || pin.length === 0}>
          <Delete size={20} aria-hidden />
        </KeyButton>
      </div>
    </div>
  );
}

function KeyButton({
  onClick,
  disabled,
  variant = 'default',
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-16 items-center justify-center rounded text-xl font-medium transition-colors active:scale-95 disabled:opacity-40',
        variant === 'primary'
          ? 'bg-primary text-primary-fg'
          : 'border border-border bg-surface text-text hover:bg-surface2',
      )}
    >
      {children}
    </button>
  );
}
