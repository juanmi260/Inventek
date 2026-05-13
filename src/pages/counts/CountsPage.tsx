import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/db';
import { Button } from '@/ui/Button';
import { PageHeader } from '@/ui/PageHeader';
import { EmptyState } from '@/ui/EmptyState';
import { ClipboardList, Plus } from 'lucide-react';
import { formatDate } from '@/utils/format';
import type { StockCount, Warehouse } from '@/domain/entities';
import { cn } from '@/utils/cn';

const STATUS_LABEL = {
  open: 'En curso',
  closed: 'Cerrado',
  cancelled: 'Cancelado',
} as const;

const STATUS_CLASS = {
  open: 'bg-primary/15 text-primary',
  closed: 'bg-success/15 text-success',
  cancelled: 'bg-muted/15 text-muted',
} as const;

export default function CountsPage() {
  const counts = useLiveQuery(
    () => db.stockCounts.orderBy('startedAt').reverse().toArray(),
    [],
    [] as StockCount[],
  );
  const warehouses = useLiveQuery(
    () => db.warehouses.toArray(),
    [],
    [] as Warehouse[],
  );

  const wMap = new Map(warehouses.map((w) => [w.id, w]));

  return (
    <>
      <PageHeader
        title="Recuentos"
        back="/more"
        actions={
          <Link to="/counts/new">
            <Button size="sm" iconStart={<Plus size={18} />}>Nuevo</Button>
          </Link>
        }
      />

      {counts.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={40} />}
          title="No hay recuentos"
          description="Crea un recuento para contar físicamente el stock de un almacén y generar los ajustes correspondientes."
          action={
            <Link to="/counts/new">
              <Button>Nuevo recuento</Button>
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {counts.map((c) => {
            const w = wMap.get(c.warehouseId);
            const expected = c.expectedSnapshot.length;
            const counted = c.countedLines.length;
            return (
              <li key={c.id}>
                <Link
                  to={`/counts/${c.id}`}
                  className="flex items-center gap-3 px-3 py-3 hover:bg-surface"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{w?.name ?? c.warehouseId}</span>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                          STATUS_CLASS[c.status],
                        )}
                      >
                        {STATUS_LABEL[c.status]}
                      </span>
                    </div>
                    <div className="text-xs text-muted">
                      {formatDate(c.startedAt)}
                      {c.scope === 'partial' && ' · parcial'}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-mono text-base">
                      {counted}/{expected}
                    </div>
                    <div className="text-muted">contados</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
