import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/db';
import { Button } from '@/ui/Button';
import { PageHeader } from '@/ui/PageHeader';
import { EmptyState } from '@/ui/EmptyState';
import { ArrowDownToLine, ArrowUpFromLine, ArrowRightLeft, Plus, SlidersHorizontal } from 'lucide-react';
import { formatDate, formatNumber } from '@/utils/format';
import type { Movement } from '@/domain/entities';

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

interface Row {
  m: Movement;
  totalQty: number;
  lineCount: number;
}

export default function MovementsPage() {
  const rows: Row[] =
    useLiveQuery(
      async () => {
        const movs = await db.movements.orderBy('occurredAt').reverse().limit(200).toArray();
        const result: Row[] = [];
        for (const m of movs) {
          const lines = await db.movementLines.where('movementId').equals(m.id).toArray();
          const totalQty = lines.reduce((a, l) => a + l.quantity, 0);
          result.push({ m, totalQty, lineCount: lines.length });
        }
        return result;
      },
      [],
    ) ?? [];

  return (
    <>
      <PageHeader
        title="Movimientos"
        actions={
          <Link to="/movements/new">
            <Button size="sm" iconStart={<Plus size={18} />}>Nuevo</Button>
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Sin movimientos"
          description="Aún no has registrado ninguna entrada, salida o transferencia."
          action={
            <Link to="/movements/new">
              <Button>Nuevo movimiento</Button>
            </Link>
          }
        />
      ) : (
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
      )}
    </>
  );
}
