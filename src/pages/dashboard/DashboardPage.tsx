import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/db';
import { PageHeader } from '@/ui/PageHeader';
import { Button } from '@/ui/Button';
import {
  Package,
  Warehouse as WarehouseIcon,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowRightLeft,
  AlertTriangle,
  ClipboardList,
  Plus,
  CheckCircle2,
  Loader2,
  WifiOff,
  Crown,
} from 'lucide-react';
import { useSync } from '@/state/sync';
import { useActiveWarehouse } from '@/state/active-warehouse';
import { EmptyState } from '@/ui/EmptyState';
import { formatNumber } from '@/utils/format';

export default function DashboardPage() {
  const { active, warehouses } = useActiveWarehouse();
  const sync = useSync();

  const stats = useLiveQuery(
    async () => {
      const [productCount, movementCount] = await Promise.all([
        db.products.filter((p) => !p.deletedAt).count(),
        db.movements.count(),
      ]);
      return { productCount, movementCount };
    },
    [],
    { productCount: 0, movementCount: 0 },
  );

  const openCount = useLiveQuery(
    async () => {
      if (!active) return undefined;
      const open = await db.stockCounts
        .where('warehouseId')
        .equals(active.id)
        .filter((c) => c.status === 'open')
        .first();
      return open;
    },
    [active?.id],
  );

  const lowStock = useLiveQuery(
    async () => {
      if (!active) return [];
      const levels = await db.stockLevels.where('warehouseId').equals(active.id).toArray();
      const flagged = levels.filter((l) => l.minStock != null && l.quantity < l.minStock);
      const products = await Promise.all(flagged.map((l) => db.products.get(l.productId)));
      return flagged.map((l, i) => ({ level: l, product: products[i] }));
    },
    [active?.id],
    [],
  );

  if (warehouses.length === 0) {
    return (
      <>
        <PageHeader title="Inventek" />
        <EmptyState
          icon={<WarehouseIcon size={48} />}
          title="Bienvenido"
          description="Crea tu primer almacén para empezar a trabajar."
          action={
            <Link to="/warehouses">
              <Button iconStart={<Plus size={18} />}>Crear almacén</Button>
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Inicio" />

      {sync.primary && <SyncStatusTile />}

      <section className="grid grid-cols-2 gap-2 px-3">
        <Card icon={<Package size={20} />} label="Productos" value={stats.productCount} to="/products" />
        <Card
          icon={<ArrowRightLeft size={20} />}
          label="Movimientos"
          value={stats.movementCount}
          to="/movements"
        />
      </section>

      {openCount && (
        <section className="px-3 pt-4">
          <Link
            to={`/counts/${openCount.id}`}
            className="flex items-center gap-3 rounded border border-primary/40 bg-primary/5 p-3"
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-primary/15 text-primary">
              <ClipboardList size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">Recuento en curso</div>
              <div className="text-xs text-muted">
                {openCount.countedLines.length}/{openCount.expectedSnapshot.length} productos contados
              </div>
            </div>
            <span className="text-xs font-medium text-primary">Continuar →</span>
          </Link>
        </section>
      )}

      <section className="px-3 pt-4">
        <h2 className="px-1 pb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Acciones rápidas
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <Link to="/movements/new?type=in">
            <Button variant="secondary" className="w-full" iconStart={<ArrowDownToLine size={18} />}>
              Entrada
            </Button>
          </Link>
          <Link to="/movements/new?type=out">
            <Button variant="secondary" className="w-full" iconStart={<ArrowUpFromLine size={18} />}>
              Salida
            </Button>
          </Link>
          <Link to="/movements/new?type=transfer">
            <Button variant="secondary" className="w-full" iconStart={<ArrowRightLeft size={18} />}>
              Transfer.
            </Button>
          </Link>
        </div>
      </section>

      {lowStock.length > 0 && (
        <section className="px-3 pt-6">
          <h2 className="flex items-center gap-2 px-1 pb-2 text-sm font-semibold uppercase tracking-wide text-warning">
            <AlertTriangle size={16} /> Bajo mínimo en {active?.code}
          </h2>
          <ul className="space-y-1.5">
            {lowStock.map(({ level, product }) => (
              <li
                key={level.id}
                className="flex items-center justify-between rounded border border-warning/30 bg-warning/5 px-3 py-2"
              >
                <Link to={`/products/${product?.id}`} className="min-w-0 flex-1">
                  <div className="truncate font-medium">{product?.name ?? '—'}</div>
                  <div className="text-xs text-muted">
                    {formatNumber(level.quantity)} / mín {formatNumber(level.minStock ?? 0)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function SyncStatusTile() {
  const sync = useSync();
  const { phase, errorMessage } = sync.progress;
  let icon: React.ReactNode = <WifiOff size={20} />;
  let label = 'Sin conexión con primario';
  let className = 'border-border';
  let to = '/sync';
  if (sync.isHost) {
    icon = <Crown size={20} className="text-warning" />;
    label = phase === 'waiting' ? 'Eres el primario · escuchando' : 'Eres el primario';
    className = 'border-warning/30 bg-warning/5';
  } else if (phase === 'done') {
    icon = <CheckCircle2 size={20} className="text-success" />;
    label = 'Sincronizado con el primario';
    className = 'border-success/30 bg-success/5';
  } else if (phase === 'syncing' || phase === 'connected' || phase === 'connecting' || phase === 'opening') {
    icon = <Loader2 size={20} className="animate-spin text-primary" />;
    label = 'Sincronizando…';
    className = 'border-primary/30 bg-primary/5';
  } else if (phase === 'error') {
    icon = <AlertTriangle size={20} className="text-danger" />;
    label = `Error: ${errorMessage ?? 'no se pudo conectar'}`;
    className = 'border-danger/30 bg-danger/5';
  }
  return (
    <section className="px-3 pt-3">
      <Link to={to} className={`flex items-center gap-3 rounded border p-3 ${className}`}>
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-surface2">
          {icon}
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <div className="truncate font-medium">{label}</div>
          {sync.lastSyncAt && (
            <div className="text-xs text-muted">
              Última: {new Date(sync.lastSyncAt).toLocaleString()}
            </div>
          )}
        </div>
      </Link>
    </section>
  );
}

function Card({
  icon,
  label,
  value,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col gap-1 rounded border border-border bg-surface p-3 hover:bg-surface2"
    >
      <span className="text-muted">{icon}</span>
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xl font-semibold">{formatNumber(value)}</span>
    </Link>
  );
}
