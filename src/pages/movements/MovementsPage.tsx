import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db } from '@/data/db';
import { Button } from '@/ui/Button';
import { PageHeader } from '@/ui/PageHeader';
import { EmptyState } from '@/ui/EmptyState';
import { ExportMenu } from '@/ui/ExportMenu';
import { cn } from '@/utils/cn';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowRightLeft,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import { formatDate, formatNumber } from '@/utils/format';
import type { Movement, MovementLine, MovementType, Warehouse } from '@/domain/entities';

const ICONS = {
  in: ArrowDownToLine,
  out: ArrowUpFromLine,
  transfer: ArrowRightLeft,
  adjust: SlidersHorizontal,
} as const;

const TYPE_LABEL = {
  in: 'Entrada',
  out: 'Salida',
  transfer: 'Transferencia',
  adjust: 'Ajuste',
} as const;

type DateRange = 'today' | '7d' | '30d' | 'all';
const PAGE_SIZE = 50;

interface Row {
  m: Movement;
  totalQty: number;
  lineCount: number;
}

function dateRangeStart(range: DateRange): string | undefined {
  if (range === 'all') return undefined;
  const now = new Date();
  if (range === 'today') {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  if (range === '7d') {
    now.setDate(now.getDate() - 7);
    return now.toISOString();
  }
  if (range === '30d') {
    now.setDate(now.getDate() - 30);
    return now.toISOString();
  }
  return undefined;
}

export default function MovementsPage() {
  const [typeFilter, setTypeFilter] = useState<MovementType | 'all'>('all');
  const [warehouseFilter, setWarehouseFilter] = useState<string | 'all'>('all');
  const [rangeFilter, setRangeFilter] = useState<DateRange>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const warehouses = useLiveQuery(
    () => db.warehouses.filter((w) => !w.deletedAt).toArray(),
    [],
    [] as Warehouse[],
  );

  const filterFrom = dateRangeStart(rangeFilter);

  const data = useLiveQuery(
    async () => {
      const movs = await db.movements.orderBy('occurredAt').reverse().toArray();
      const filtered = movs.filter((m) => {
        if (typeFilter !== 'all' && m.type !== typeFilter) return false;
        if (
          warehouseFilter !== 'all' &&
          m.warehouseId !== warehouseFilter &&
          m.destinationWarehouseId !== warehouseFilter
        )
          return false;
        if (filterFrom && m.occurredAt < filterFrom) return false;
        return true;
      });
      const visible = filtered.slice(0, limit);
      const lines = await db.movementLines.toArray();
      const byMov = new Map<string, MovementLine[]>();
      for (const l of lines) {
        const a = byMov.get(l.movementId) ?? [];
        a.push(l);
        byMov.set(l.movementId, a);
      }
      const result: Row[] = visible.map((m) => {
        const ls = byMov.get(m.id) ?? [];
        return { m, totalQty: ls.reduce((a, l) => a + l.quantity, 0), lineCount: ls.length };
      });
      return { rows: result, totalCount: filtered.length };
    },
    [typeFilter, warehouseFilter, filterFrom, limit],
  );

  const rows = data?.rows ?? [];
  const totalCount = data?.totalCount ?? 0;
  const exportFilter = useMemo(
    () => ({
      type: typeFilter === 'all' ? undefined : typeFilter,
      warehouseId: warehouseFilter === 'all' ? undefined : warehouseFilter,
      from: filterFrom,
    }),
    [typeFilter, warehouseFilter, filterFrom],
  );

  return (
    <>
      <PageHeader
        title="Movimientos"
        actions={
          <div className="flex gap-1">
            <ExportMenu target="movements" filter={exportFilter} />
            <Link to="/movements/new">
              <Button size="sm" iconStart={<Plus size={18} />}>Nuevo</Button>
            </Link>
          </div>
        }
      />

      <div className="space-y-2 px-3 pb-2">
        <ChipsRow>
          <Chip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>
            Todos
          </Chip>
          {(['in', 'out', 'transfer', 'adjust'] as MovementType[]).map((t) => (
            <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
              {TYPE_LABEL[t]}
            </Chip>
          ))}
        </ChipsRow>

        {warehouses.length > 1 && (
          <ChipsRow>
            <Chip active={warehouseFilter === 'all'} onClick={() => setWarehouseFilter('all')}>
              Todos los almacenes
            </Chip>
            {warehouses.map((w) => (
              <Chip
                key={w.id}
                active={warehouseFilter === w.id}
                onClick={() => setWarehouseFilter(w.id)}
              >
                {w.code}
              </Chip>
            ))}
          </ChipsRow>
        )}

        <ChipsRow>
          {(
            [
              ['all', 'Todo el tiempo'],
              ['today', 'Hoy'],
              ['7d', '7 días'],
              ['30d', '30 días'],
            ] as Array<[DateRange, string]>
          ).map(([key, label]) => (
            <Chip key={key} active={rangeFilter === key} onClick={() => setRangeFilter(key)}>
              {label}
            </Chip>
          ))}
        </ChipsRow>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Sin movimientos"
          description={
            typeFilter === 'all' && warehouseFilter === 'all' && rangeFilter === 'all'
              ? 'Aún no has registrado ninguna entrada, salida o transferencia.'
              : 'No hay resultados con los filtros aplicados.'
          }
          action={
            typeFilter === 'all' && warehouseFilter === 'all' && rangeFilter === 'all' ? (
              <Link to="/movements/new">
                <Button>Nuevo movimiento</Button>
              </Link>
            ) : null
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {rows.map(({ m, totalQty, lineCount }) => {
              const Icon = ICONS[m.type];
              return (
                <li key={m.id} className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface2 text-muted"
                      aria-hidden
                    >
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{TYPE_LABEL[m.type]}</span>
                        <span className="rounded bg-surface2 px-1.5 py-0.5 text-xs text-muted">{m.reason}</span>
                      </div>
                      <div className="text-xs text-muted">{formatDate(m.occurredAt)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono">{formatNumber(totalQty)}</div>
                      <div className="text-xs text-muted">{lineCount} líneas</div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {totalCount > rows.length && (
            <div className="px-3 py-3 text-center">
              <Button variant="secondary" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                Cargar {Math.min(PAGE_SIZE, totalCount - rows.length)} más ·{' '}
                {rows.length}/{totalCount}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function ChipsRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-primary text-primary-fg'
          : 'border border-border bg-surface text-muted hover:bg-surface2',
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
