import { useEffect, useState } from 'react';
import { PageHeader } from '@/ui/PageHeader';
import { Button } from '@/ui/Button';
import { useTheme } from '@/state/theme';
import { ensurePersistentStorage, getStorageEstimate } from '@/platform/storage';
import { formatBytes } from '@/utils/format';
import { showToast } from '@/ui/Toast';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { db } from '@/data/db';
import { Sun, Moon, Monitor } from 'lucide-react';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [estimate, setEstimate] = useState<{ quota: number; usage: number } | null>(null);
  const [persistent, setPersistent] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);

  useEffect(() => {
    void getStorageEstimate().then(setEstimate);
    void navigator.storage?.persisted?.().then(setPersistent);
  }, []);

  const requestPersistent = async () => {
    const ok = await ensurePersistentStorage();
    setPersistent(ok);
    showToast({
      title: ok ? 'Almacenamiento persistente activado' : 'No se ha concedido',
      variant: ok ? 'success' : 'warning',
    });
  };

  const wipe = async () => {
    await db.delete();
    localStorage.clear();
    showToast({ title: 'Datos borrados. La app se recargará.', variant: 'success' });
    setTimeout(() => location.reload(), 1000);
  };

  return (
    <>
      <PageHeader title="Ajustes" back="/more" />

      <div className="space-y-3 px-3">
        <section className="rounded border border-border bg-surface p-3">
          <h2 className="text-sm font-semibold">Tema</h2>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <ThemeButton current={theme} value="light" onClick={setTheme} icon={<Sun size={18} />} label="Claro" />
            <ThemeButton current={theme} value="dark" onClick={setTheme} icon={<Moon size={18} />} label="Oscuro" />
            <ThemeButton current={theme} value="system" onClick={setTheme} icon={<Monitor size={18} />} label="Sistema" />
          </div>
        </section>

        <section className="rounded border border-border bg-surface p-3">
          <h2 className="text-sm font-semibold">Almacenamiento</h2>
          {estimate && (
            <p className="mt-1 text-sm text-muted">
              {formatBytes(estimate.usage)} usados de {formatBytes(estimate.quota)} disponibles.
            </p>
          )}
          <p className="mt-1 text-xs text-muted">
            {persistent
              ? 'Tus datos están protegidos contra desalojo automático.'
              : 'El navegador podría borrar los datos si necesita espacio. Activa la persistencia.'}
          </p>
          {!persistent && (
            <Button className="mt-3" variant="secondary" onClick={requestPersistent}>
              Activar almacenamiento persistente
            </Button>
          )}
        </section>

        <section className="rounded border border-danger/40 bg-danger/5 p-3">
          <h2 className="text-sm font-semibold text-danger">Zona peligrosa</h2>
          <p className="mt-1 text-sm text-muted">
            Esta acción borra todos los datos locales (productos, almacenes, movimientos…). Exporta antes.
          </p>
          <Button variant="danger" className="mt-3" onClick={() => setWipeOpen(true)}>
            Borrar todos los datos
          </Button>
        </section>

        <p className="pt-4 text-center text-xs text-muted">
          Inventek — local-first, sin servidor.
        </p>
      </div>

      <ConfirmDialog
        open={wipeOpen}
        onOpenChange={setWipeOpen}
        title="Borrar todos los datos"
        description="¿Seguro? Esta acción es irreversible. Habrás exportado antes si los necesitas."
        destructive
        confirmLabel="Borrar"
        onConfirm={wipe}
      />
    </>
  );
}

function ThemeButton({
  current,
  value,
  onClick,
  icon,
  label,
}: {
  current: string;
  value: 'light' | 'dark' | 'system';
  onClick: (v: 'light' | 'dark' | 'system') => void;
  icon: React.ReactNode;
  label: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={
        active
          ? 'flex h-16 flex-col items-center justify-center gap-1 rounded bg-primary text-primary-fg'
          : 'flex h-16 flex-col items-center justify-center gap-1 rounded border border-border bg-bg text-text'
      }
      aria-pressed={active}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
