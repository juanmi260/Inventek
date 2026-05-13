import { useEffect, useState } from 'react';
import { PageHeader } from '@/ui/PageHeader';
import { Button } from '@/ui/Button';
import { Download, Upload, RotateCcw, FolderArchive, Share2, Trash2 } from 'lucide-react';
import { showToast } from '@/ui/Toast';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Sheet } from '@/ui/Sheet';
import {
  exportBackupBlob,
  importBackup,
  listLocalBackups,
  pruneLocalBackups,
  readBackupFromBlob,
  readLocalBackup,
  removeLocalBackup,
  saveBackupLocal,
} from '@/platform/backup';
import { describeBackupBackend } from '@/platform/backupStore';
import { pickFile, saveBlob, shareBlob } from '@/platform/file-system';
import { rebuildStockLevels } from '@/domain/use-cases/rebuildStockLevels';
import { formatBytes, formatDate } from '@/utils/format';

interface LocalBackup {
  id: string;
  name: string;
  size: number;
  mtime: number;
}

export default function BackupPage() {
  const [items, setItems] = useState<LocalBackup[]>([]);
  const [backend, setBackend] = useState<{ backend: 'opfs' | 'idb'; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const [toDelete, setToDelete] = useState<LocalBackup | null>(null);

  useEffect(() => {
    void refresh();
    void describeBackupBackend().then(setBackend);
  }, []);

  const refresh = async () => setItems(await listLocalBackups());

  const doExport = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await exportBackupBlob({ gzip: true });
      const shared = await shareBlob(blob, filename);
      if (!shared) await saveBlob(blob, filename);
      showToast({ title: 'Backup exportado', variant: 'success' });
    } catch (e) {
      showToast({ title: 'Error al exportar', description: String(e), variant: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const doLocalBackup = async () => {
    setBusy(true);
    try {
      const entry = await saveBackupLocal();
      if (entry) {
        await pruneLocalBackups(14);
        await refresh();
        showToast({
          title: 'Backup guardado',
          description: entry.name,
          variant: 'success',
        });
      } else {
        showToast({
          title: 'No se ha podido guardar',
          description: 'Tu navegador no permite escribir en almacenamiento local.',
          variant: 'danger',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const shareLocal = async (it: LocalBackup) => {
    const blob = await readLocalBackup(it.id);
    if (!blob) {
      showToast({ title: 'No se ha podido leer el backup', variant: 'danger' });
      return;
    }
    const shared = await shareBlob(blob, it.name);
    if (!shared) await saveBlob(blob, it.name);
  };

  const deleteLocal = async (it: LocalBackup) => {
    await removeLocalBackup(it.id);
    await refresh();
    showToast({ title: 'Backup eliminado', variant: 'success' });
  };

  const triggerImport = async () => {
    const f = await pickFile();
    if (f) setPendingImport(f);
  };

  const applyImport = async (mode: 'merge' | 'replace') => {
    if (!pendingImport) return;
    setBusy(true);
    try {
      await saveBackupLocal();
      const backup = await readBackupFromBlob(pendingImport);
      const summary = await importBackup(backup, mode);
      const total = Object.values(summary).reduce((a, b) => a + b, 0);
      showToast({
        title: 'Importación completada',
        description: `${total} registros (${mode === 'replace' ? 'reemplazo' : 'fusión'})`,
        variant: 'success',
      });
      setPendingImport(null);
      await refresh();
    } catch (e) {
      showToast({ title: 'Error al importar', description: String(e), variant: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Backup y restaurar" back="/more" />
      <div className="space-y-3 px-3">
        <section className="rounded border border-border bg-surface p-3">
          <h2 className="text-sm font-semibold">Exportar</h2>
          <p className="mt-1 text-sm text-muted">
            Genera un fichero <code>.json.gz</code> con todos tus datos. Puedes guardarlo o compartirlo.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={doExport} loading={busy} iconStart={<Download size={18} />}>
              Exportar todo
            </Button>
            <Button
              variant="secondary"
              onClick={doLocalBackup}
              loading={busy}
              iconStart={<FolderArchive size={18} />}
            >
              Guardar copia en el dispositivo
            </Button>
          </div>
        </section>

        <section className="rounded border border-border bg-surface p-3">
          <h2 className="text-sm font-semibold">Importar</h2>
          <p className="mt-1 text-sm text-muted">
            Restaura desde un fichero <code>.json</code> o <code>.json.gz</code>. Antes del cambio se guarda un backup automático.
          </p>
          <div className="mt-3">
            <Button variant="secondary" onClick={triggerImport} iconStart={<Upload size={18} />}>
              Elegir fichero…
            </Button>
          </div>
        </section>

        <section className="rounded border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Backups en este dispositivo</h2>
            {backend && (
              <span className="rounded bg-surface2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                {backend.backend === 'opfs' ? 'OPFS' : 'IndexedDB'}
              </span>
            )}
          </div>
          {backend && <p className="mt-1 text-xs text-muted">{backend.label}</p>}
          {items.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Aún no hay copias locales.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono">{it.name}</div>
                    <div className="text-xs text-muted">
                      {formatDate(new Date(it.mtime).toISOString())} · {formatBytes(it.size)}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Compartir / descargar"
                    onClick={() => void shareLocal(it)}
                    className="rounded p-2 text-muted hover:bg-surface2 hover:text-text"
                  >
                    <Share2 size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="Eliminar"
                    onClick={() => setToDelete(it)}
                    className="rounded p-2 text-muted hover:bg-surface2 hover:text-danger"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded border border-border bg-surface p-3">
          <h2 className="text-sm font-semibold">Mantenimiento</h2>
          <p className="mt-1 text-sm text-muted">
            Si crees que el stock está descuadrado, recalcula los niveles desde el historial.
          </p>
          <div className="mt-3">
            <Button variant="secondary" iconStart={<RotateCcw size={18} />} onClick={() => setRebuildOpen(true)}>
              Reconstruir stock
            </Button>
          </div>
        </section>
      </div>

      <Sheet
        open={!!pendingImport}
        onOpenChange={(o) => !o && setPendingImport(null)}
        title="Importar backup"
        description={pendingImport?.name}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">¿Cómo quieres aplicar los datos del fichero?</p>
          <Button className="w-full" onClick={() => applyImport('merge')} loading={busy}>
            Fusionar con los datos actuales
          </Button>
          <Button
            variant="danger"
            className="w-full"
            onClick={() => applyImport('replace')}
            loading={busy}
          >
            Reemplazar TODO
          </Button>
          <p className="text-xs text-muted">
            En ambos modos se guarda un backup local antes de aplicar los cambios.
          </p>
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Eliminar ${toDelete?.name ?? ''}`}
        description="Esta copia local se borrará. Tus datos principales no se ven afectados."
        destructive
        confirmLabel="Eliminar"
        onConfirm={() => toDelete && void deleteLocal(toDelete)}
      />

      <ConfirmDialog
        open={rebuildOpen}
        onOpenChange={setRebuildOpen}
        title="Reconstruir niveles de stock"
        description="Recalcularé el stock de cada producto a partir de todos los movimientos confirmados. Esta operación es reversible (no toca movimientos)."
        confirmLabel="Reconstruir"
        onConfirm={async () => {
          setBusy(true);
          const r = await rebuildStockLevels();
          setBusy(false);
          showToast({ title: 'Stock reconstruido', description: `${r.touched} niveles`, variant: 'success' });
        }}
      />
    </>
  );
}
