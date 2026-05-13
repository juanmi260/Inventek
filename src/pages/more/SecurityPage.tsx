import { useState } from 'react';
import { PageHeader } from '@/ui/PageHeader';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Input } from '@/ui/Input';
import { showToast } from '@/ui/Toast';
import { useLock } from '@/state/lock';
import { Lock, LockOpen, Eye, EyeOff, Shield } from 'lucide-react';

const TIMEOUTS = [
  { value: 0, label: 'Desactivado' },
  { value: 1, label: '1 minuto' },
  { value: 5, label: '5 minutos' },
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
];

export default function SecurityPage() {
  const {
    hasPin,
    lockTimeoutMin,
    lockOnHidden,
    setPin,
    clearPin,
    lockNow,
    setLockTimeout,
    setLockOnHidden,
  } = useLock();
  const [setPinOpen, setSetPinOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  return (
    <>
      <PageHeader title="Seguridad" back="/more" />

      <div className="space-y-3 px-3">
        <section className="rounded border border-border bg-surface p-3">
          <div className="flex items-start gap-2">
            <Shield size={18} className="mt-0.5 text-primary" />
            <div className="text-sm">
              <p>
                El PIN protege la apertura de la app en este dispositivo. El hash se calcula
                con PBKDF2-SHA-256 (200 000 iteraciones) y se guarda solo aquí.
              </p>
              <p className="mt-1 text-xs text-muted">
                Si lo olvidas no se puede recuperar; tendrías que borrar los datos.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded border border-border bg-surface p-3">
          <h2 className="text-sm font-semibold">PIN de apertura</h2>
          <p className="mt-1 text-sm text-muted">
            {hasPin ? 'El PIN está activado.' : 'El PIN está desactivado.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant={hasPin ? 'secondary' : 'primary'}
              iconStart={hasPin ? <Lock size={16} /> : <Lock size={16} />}
              onClick={() => setSetPinOpen(true)}
            >
              {hasPin ? 'Cambiar PIN' : 'Activar PIN'}
            </Button>
            {hasPin && (
              <>
                <Button variant="secondary" iconStart={<Lock size={16} />} onClick={lockNow}>
                  Bloquear ahora
                </Button>
                <Button
                  variant="ghost"
                  iconStart={<LockOpen size={16} />}
                  onClick={() => setRemoveOpen(true)}
                >
                  Quitar PIN
                </Button>
              </>
            )}
          </div>
        </section>

        <section className="rounded border border-border bg-surface p-3">
          <h2 className="text-sm font-semibold">Bloqueo automático</h2>
          <label className="mt-2 block">
            <span className="mb-1 block text-xs text-muted">Bloquear tras inactividad</span>
            <select
              value={lockTimeoutMin}
              onChange={(e) => setLockTimeout(Number(e.target.value))}
              className="h-11 w-full rounded border border-border bg-bg px-3"
              disabled={!hasPin}
            >
              {TIMEOUTS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm">
              Bloquear al cerrar la app
              <span className="block text-xs text-muted">
                Bloquea en cuanto sales de la pestaña.
              </span>
            </span>
            <input
              type="checkbox"
              checked={lockOnHidden}
              onChange={(e) => setLockOnHidden(e.target.checked)}
              disabled={!hasPin}
              className="h-5 w-5"
            />
          </label>
          {!hasPin && (
            <p className="mt-2 text-xs text-muted">
              Activa primero un PIN para configurar el bloqueo automático.
            </p>
          )}
        </section>
      </div>

      {setPinOpen && (
        <SetPinSheet
          hasPin={hasPin}
          onClose={() => setSetPinOpen(false)}
          onSubmit={async (newPin, currentPin) => {
            const res = await setPin(newPin, currentPin);
            if (res.ok) {
              showToast({ title: 'PIN actualizado', variant: 'success' });
              setSetPinOpen(false);
            }
            return res;
          }}
        />
      )}

      {removeOpen && (
        <RemovePinSheet
          onClose={() => setRemoveOpen(false)}
          onSubmit={async (pin) => {
            const res = await clearPin(pin);
            if (res.ok) {
              showToast({ title: 'PIN eliminado', variant: 'success' });
              setRemoveOpen(false);
            }
            return res;
          }}
        />
      )}
    </>
  );
}

function SetPinSheet({
  hasPin,
  onClose,
  onSubmit,
}: {
  hasPin: boolean;
  onClose: () => void;
  onSubmit: (newPin: string, currentPin?: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
}) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (newPin.length < 4 || newPin.length > 6) {
      setError('El PIN debe tener entre 4 y 6 dígitos.');
      return;
    }
    if (!/^\d+$/.test(newPin)) {
      setError('Solo dígitos numéricos.');
      return;
    }
    if (newPin !== confirm) {
      setError('Los PINs no coinciden.');
      return;
    }
    setBusy(true);
    const res = await onSubmit(newPin, hasPin ? currentPin : undefined);
    setBusy(false);
    if (!res.ok) setError(res.reason);
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={hasPin ? 'Cambiar PIN' : 'Activar PIN'}>
      <div className="space-y-3">
        {hasPin && (
          <Input
            label="PIN actual"
            type={show ? 'text' : 'password'}
            inputMode="numeric"
            maxLength={6}
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
            autoFocus
          />
        )}
        <Input
          label={`PIN nuevo (4-6 dígitos)`}
          type={show ? 'text' : 'password'}
          inputMode="numeric"
          maxLength={6}
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
          autoFocus={!hasPin}
        />
        <Input
          label="Confirmar PIN"
          type={show ? 'text' : 'password'}
          inputMode="numeric"
          maxLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="flex items-center gap-1 text-xs text-muted"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />} {show ? 'Ocultar' : 'Mostrar'} dígitos
        </button>

        {error && <div className="rounded bg-danger/10 p-2 text-sm text-danger">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy} disabled={!newPin || !confirm}>
            Guardar
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function RemovePinSheet({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (pin: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const res = await onSubmit(pin);
    setBusy(false);
    if (!res.ok) setError(res.reason);
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Quitar PIN">
      <div className="space-y-3">
        <Input
          label="PIN actual"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          autoFocus
        />
        {error && <div className="rounded bg-danger/10 p-2 text-sm text-danger">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={submit} loading={busy} disabled={!pin}>
            Quitar PIN
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
