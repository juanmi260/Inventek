import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db } from '@/data/db';
import { PageHeader } from '@/ui/PageHeader';
import { ExportMenu } from '@/ui/ExportMenu';
import { EmptyState } from '@/ui/EmptyState';
import { useSettings } from '@/state/settings';
import { formatMoney, formatNumber } from '@/utils/format';
import { cn } from '@/utils/cn';
import { BarChart3 } from 'lucide-react';
import type { Product, StockLevel, Warehouse } from '@/domain/entities';

type View = 'stock' | 'valuation';

export default function ReportsPage() {
  const { settings } = useSettings();
  const [view, setView] = useState<View>('stock');

  const warehouses = useLiveQuery(
    () => db.warehouses.filter((w) => !w.deletedAt && !w.archived).toArray(),
    [],
    [] as Warehouse[],
  );
  const products = useLiveQuery(
    () => db.products.filter((p) => !p.deletedAt).toArray(),
    [],
    [] as Product[],
  );
  const levels = useLiveQuery(() => db.stockLevels.toArray(), [], [] as StockLevel[]);

  const stockByWarehouse = useMemo(() => {
    const wMap = new Map(warehouses.map((w) => [w.id, w]));
    const acc = new Map<string, { warehouse: Warehouse; qty: number; cost: number; sale: number }>();
    const pMap = new Map(products.map((p) => [p.id, p]));
    for (const l of levels) {
      const w = wMap.get(l.warehouseId);
      if (!w) continue;
      const p = pMap.get(l.productId);
      const entry = acc.get(l.warehouseId) ?? { warehouse: w, qty: 0, cost: 0, sale: 0 };
      entry.qty += l.quantity;
      if (p?.costPrice != null) entry.cost += l.quantity * p.costPrice;
      if (p?.salePrice != null) entry.sale += l.quantity * p.salePrice;
      acc.set(l.warehouseId, entry);
    }
    return Array.from(acc.values()).sort((a, b) => a.warehouse.code.localeCompare(b.warehouse.code));
  }, [levels, products, warehouses]);

  const totals = useMemo(() => {
    return stockByWarehouse.reduce(
      (acc, e) => ({ qty: acc.qty + e.qty, cost: acc.cost + e.cost, sale: acc.sale + e.sale }),
      { qty: 0, cost: 0, sale: 0 },
    );
  }, [stockByWarehouse]);

  if (warehouses.length === 0 || products.length === 0) {
    return (
      <>
        <PageHeader title="Reportes" back="/more" />
        <EmptyState
          icon={<BarChart3 size={40} />}
          title="Sin datos suficientes"
          description="Da de alta almacenes y productos para empezar a ver reportes."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Reportes"
        back="/more"
        actions={<ExportMenu target="stock" label="Exportar stock" />}
      />

      <div className="px-3 pb-2">
        <div className="grid grid-cols-2 gap-1 rounded border border-border bg-surface p-1">
          <TabButton active={view === 'stock'} onClick={() => setView('stock')}>
            Stock
          </TabButton>
          <TabButton active={view === 'valuation'} onClick={() => setView('valuation')}>
            Valoración
          </TabButton>
        </div>
      </div>

      <div className="space-y-3 px-3">
        {view === 'stock' ? (
          <>
            <Card label="Unidades totales en stock" value={formatNumber(totals.qty)} />
            <ul className="space-y-1.5">
              {stockByWarehouse.map((e) => (
                <li
                  key={e.warehouse.id}
                  className="flex items-center justify-between rounded border border-border bg-surface px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{e.warehouse.name}</div>
                    <div className="text-xs text-muted">{e.warehouse.code}</div>
                  </div>
                  <div className="font-mono">{formatNumber(e.qty)}</div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Card label="Valor a coste" value={formatMoney(totals.cost, settings.currency, settings.locale)} />
              <Card label="Valor a venta" value={formatMoney(totals.sale, settings.currency, settings.locale)} />
            </div>
            <div className="rounded border border-border bg-surface p-3 text-sm">
              <div className="text-xs text-muted">Margen potencial</div>
              <div className="text-lg font-semibold">
                {formatMoney(totals.sale - totals.cost, settings.currency, settings.locale)}
              </div>
            </div>

            <h3 className="px-1 pt-2 text-sm font-semibold uppercase tracking-wide text-muted">
              Por almacén
            </h3>
            <ul className="space-y-1.5">
              {stockByWarehouse.map((e) => (
                <li
                  key={e.warehouse.id}
                  className="rounded border border-border bg-surface px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="truncate font-medium">{e.warehouse.name}</div>
                    <div className="text-xs text-muted">{formatNumber(e.qty)} u.</div>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-xs text-muted">Coste</span>
                      <div className="font-mono">{formatMoney(e.cost, settings.currency, settings.locale)}</div>
                    </div>
                    <div>
                      <span className="text-xs text-muted">Venta</span>
                      <div className="font-mono">{formatMoney(e.sale, settings.currency, settings.locale)}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="px-1 py-2 text-xs text-muted">
              La valoración usa los precios actuales de cada producto. Los movimientos pasados no
              registran historial de precios todavía.
            </p>
          </>
        )}
      </div>
    </>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-surface p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function TabButton({
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
      aria-pressed={active}
      className={cn(
        'rounded px-3 py-1.5 text-sm font-medium',
        active ? 'bg-primary text-primary-fg' : 'text-muted',
      )}
    >
      {children}
    </button>
  );
}
