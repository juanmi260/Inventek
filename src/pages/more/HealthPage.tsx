import { useEffect, useState } from 'react';
import { PageHeader } from '@/ui/PageHeader';
import { Button } from '@/ui/Button';
import { showToast } from '@/ui/Toast';
import { db } from '@/data/db';
import { getStorageEstimate } from '@/platform/storage';
import { describeBackupBackend } from '@/platform/backupStore';
import { listLocalBackups } from '@/platform/backup';
import { rebuildStockLevels } from '@/domain/use-cases/rebuildStockLevels';
import { formatBytes, formatDate, formatNumber } from '@/utils/format';
import { CheckCircle2, AlertTriangle, RotateCcw, Loader2 } from 'lucide-react';

interface IntegrityReport {
  orphanMovementLines: number;
  orphanStockLevels: number;
  negativeLevels: number;
  totalProducts: number;
  totalWarehouses: number;
  totalMovements: number;
  totalStockLevels: number;
}

export default function HealthPage() {
  const [estimate, setEstimate] = useState<{ quota: number; usage: number } | null>(null);
  const [backend, setBackend] = useState<{ backend: 'opfs' | 'idb'; label: string } | null>(null);
  const [lastBackup, setLastBackup] = useState<{ name: string; mtime: number } | null>(null);
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [persistent, setPersistent] = useState<boolean | null>(null);

  useEffect(() => {
    void getStorageEstimate().then(setEstimate);
    void describeBackupBackend().then(setBackend);
    void listLocalBackups().then((items) => {
      const first = items[0];
      if (first) setLastBackup({ name: first.name, mtime: first.mtime });
    });
    void navigator.storage?.persisted?.().then((p) => setPersistent(!!p));
  }, []);

  const runIntegrity = async () => {
    setScanning(true);
    try {
      const [products, warehouses, lines, levels] = await Promise.all([
        db.products.toArray(),
        db.warehouses.toArray(),
        db.movementLines.toArray(),
        db.stockLevels.toArray(),
      ]);
      const movementIds = new Set((await db.movements.toArray()).map((m) => m.id));
      const productIds = new Set(products.map((p) => p.id));
      const warehouseIds = new Set(warehouses.map((w) => w.id));

      const orphanMovementLines = lines.filter(
        (l) => !movementIds.has(l.movementId) || !productIds.has(l.productId),
      ).length;
      const orphanStockLevels = levels.filter(
        (l) => !productIds.has(l.productId) || !warehouseIds.has(l.warehouseId),
      ).length;
      const negativeLevels = levels.filter((l) => l.quantity < 0).length;

      setReport({
        orphanMovementLines,
        orphanStockLevels,
        negativeLevels,
        totalProducts: products.filter((p) => !p.deletedAt).length,
        totalWarehouses: warehouses.filter((w) => !w.deletedAt).length,
        totalMovements: movementIds.size,
        totalStockLevels: levels.length,
      });
    } finally {
      setScanning(false);
    }
  };

  const doRebuild = async () => {
    setRebuilding(true);
    const r = await rebuildStockLevels();
    setRebuilding(false);
    showToast({ title: 'Stock reconstruido', description: `${r.touched} niveles`, variant: 'success' });
    void runIntegrity();
  };

  const hasIssues =
    report && (report.orphanMovementLines > 0 || report.orphanStockLevels > 0 || report.negativeLevels > 0);

  return (
    <>
      <PageHeader title="Salud de los datos" back="/more" />

      <div className="space-y-3 px-3">
        <section className="rounded border border-border bg-surface p-3">
          <h2 className="text-sm font-semibold">Almacenamiento</h2>
          {estimate && (
            <p className="mt-1 text-sm">
              <span className="font-mono">{formatBytes(estimate.usage)}</span> usados de{' '}
              <span className="font-mono">{formatBytes(estimate.quota)}</span>.
            </p>
          )}
          {persistent != null && (
            <p className="mt-1 text-xs text-muted">
              Persistencia: {persistent ? '✓ activada' : '✗ no activada (el navegador puede desalojar datos)'}
            </p>
          )}
        </section>

        <section className="rounded border border-border bg-surface p-3">
          <h2 className="text-sm font-semibold">Último backup local</h2>
          {lastBackup ? (
            <>
              <p className="mt-1 text-sm font-mono">{lastBackup.name}</p>
              <p className="text-xs text-muted">{formatDate(new Date(lastBackup.mtime).toISOString())}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">No hay backups en este dispositivo.</p>
          )}
          {backend && (
            <p className="mt-2 text-[10px] uppercase tracking-wide text-muted">
              Backend: {backend.backend === 'opfs' ? 'OPFS' : 'IndexedDB'} · {backend.label}
            </p>
          )}
        </section>

        <section className="rounded border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Integridad</h2>
            <Button size="sm" variant="secondary" onClick={runIntegrity} loading={scanning}>
              Revisar
            </Button>
          </div>

          {!report && !scanning && (
            <p className="mt-1 text-sm text-muted">
              Pulsa "Revisar" para comprobar huérfanos, referencias rotas y stock negativo.
            </p>
          )}

          {scanning && (
            <p className="mt-1 flex items-center gap-1 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" /> Comprobando…
            </p>
          )}

          {report && (
            <>
              <div className="mt-2 flex items-center gap-2 text-sm">
                {hasIssues ? (
                  <>
                    <AlertTriangle size={16} className="text-warning" />
                    <span>Se han detectado incidencias.</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} className="text-success" />
                    <span>Todo en orden.</span>
                  </>
                )}
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                <ReportRow label="Productos activos" value={formatNumber(report.totalProducts)} />
                <ReportRow label="Almacenes activos" value={formatNumber(report.totalWarehouses)} />
                <ReportRow label="Movimientos" value={formatNumber(report.totalMovements)} />
                <ReportRow label="Niveles de stock" value={formatNumber(report.totalStockLevels)} />
                <ReportRow
                  label="Líneas huérfanas"
                  value={formatNumber(report.orphanMovementLines)}
                  warn={report.orphanMovementLines > 0}
                />
                <ReportRow
                  label="Niveles huérfanos"
                  value={formatNumber(report.orphanStockLevels)}
                  warn={report.orphanStockLevels > 0}
                />
                <ReportRow
                  label="Stock negativo"
                  value={formatNumber(report.negativeLevels)}
                  warn={report.negativeLevels > 0}
                />
              </ul>
              {hasIssues && (
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    iconStart={<RotateCcw size={16} />}
                    onClick={doRebuild}
                    loading={rebuilding}
                  >
                    Reconstruir stock desde el histórico
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

function ReportRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <li className="flex items-center justify-between">
      <span className={warn ? 'text-warning' : 'text-muted'}>{label}</span>
      <span className={'font-mono ' + (warn ? 'text-warning' : '')}>{value}</span>
    </li>
  );
}
