import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { db } from '@/data/db';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { PageHeader } from '@/ui/PageHeader';
import { Sheet } from '@/ui/Sheet';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { showToast } from '@/ui/Toast';
import { cn } from '@/utils/cn';
import { formatNumber, formatDate } from '@/utils/format';
import {
  Check,
  ChevronUp,
  ChevronDown,
  ScanLine,
  ListIcon,
  Plus,
  Minus,
  Trash2,
  Ban,
  CheckCheck,
} from 'lucide-react';
import { Scanner } from '@/features/scanner/Scanner';
import { acquireWakeLock } from '@/platform/wakelock';
import { errorBuzz } from '@/platform/sound';
import { hapticTap } from '@/platform/scanner';
import {
  cancelStockCount,
  closeStockCount,
  incrementCount,
  removeCountedItem,
  setCountQuantity,
} from '@/domain/use-cases/stockCount';
import { productRepo } from '@/data/repositories';
import type { Product, StockCount } from '@/domain/entities';

type Tab = 'list' | 'scan';
type Filter = 'all' | 'pending' | 'counted' | 'diff';

interface DerivedRow {
  productId: string;
  product?: Product;
  expected: number;
  counted: number | null;
  diff: number;
  countedAt?: string;
}

export default function CountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('list');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [closing, setClosing] = useState(false);
  const [lastScan, setLastScan] = useState<{ product: Product; counted: number } | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);

  const count = useLiveQuery(
    () => (id ? db.stockCounts.get(id) : undefined),
    [id],
  ) as StockCount | undefined;

  const products = useLiveQuery(
    () => db.products.filter((p) => !p.deletedAt).toArray(),
    [],
    [] as Product[],
  );
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Wake lock during scan tab on an open count.
  useEffect(() => {
    if (tab !== 'scan' || count?.status !== 'open') return;
    let release: (() => void) | null = null;
    void acquireWakeLock().then((r) => (release = r));
    return () => {
      release?.();
    };
  }, [tab, count?.status]);

  const rows: DerivedRow[] = useMemo(() => {
    if (!count) return [];
    const countedMap = new Map(count.countedLines.map((l) => [l.productId, l]));
    const productIds = new Set<string>();
    count.expectedSnapshot.forEach((s) => productIds.add(s.productId));
    count.countedLines.forEach((l) => productIds.add(l.productId));
    const expectedMap = new Map(count.expectedSnapshot.map((s) => [s.productId, s.expected]));

    const list: DerivedRow[] = [];
    productIds.forEach((pid) => {
      const expected = expectedMap.get(pid) ?? 0;
      const cline = countedMap.get(pid);
      const counted = cline?.counted ?? null;
      list.push({
        productId: pid,
        product: productMap.get(pid),
        expected,
        counted,
        diff: counted == null ? 0 : counted - expected,
        countedAt: cline?.countedAt,
      });
    });
    list.sort((a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? ''));
    return list;
  }, [count, productMap]);

  const deferredSearch = useDeferredValue(search);
  const filteredRows = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'pending' && r.counted != null) return false;
      if (filter === 'counted' && r.counted == null) return false;
      if (filter === 'diff' && r.diff === 0) return false;
      if (!q) return true;
      const p = r.product;
      if (!p) return false;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcodes.some((b) => b.toLowerCase().includes(q))
      );
    });
  }, [rows, deferredSearch, filter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const counted = rows.filter((r) => r.counted != null).length;
    const diff = rows.filter((r) => r.diff !== 0).length;
    return { total, counted, diff };
  }, [rows]);

  if (!count) {
    return (
      <>
        <PageHeader title="Recuento" back="/counts" />
        <div className="p-3 text-muted">Cargando…</div>
      </>
    );
  }

  const isOpen = count.status === 'open';

  const handleScanned = async (code: string) => {
    if (!isOpen) return;
    const product = await productRepo.findByBarcode(code);
    if (!product) {
      errorBuzz();
      setUnknownCode(code);
      return;
    }
    const res = await incrementCount(count.id, product.id, 1);
    if (!res.ok) {
      showToast({ title: 'No se ha podido sumar', variant: 'danger' });
      return;
    }
    const cline = res.value.countedLines.find((l) => l.productId === product.id);
    setLastScan({ product, counted: cline?.counted ?? 1 });
    hapticTap(20);
  };

  const onClose = async () => {
    setClosing(true);
    const res = await closeStockCount(count.id);
    setClosing(false);
    if (!res.ok) {
      showToast({ title: 'No se ha podido cerrar', variant: 'danger' });
      return;
    }
    showToast({
      title: 'Recuento cerrado',
      description: `${res.value.movementIds.length} movimiento(s) generado(s).`,
      variant: 'success',
    });
  };

  const onCancel = async () => {
    const res = await cancelStockCount(count.id);
    if (!res.ok) {
      showToast({ title: 'No se ha podido cancelar', variant: 'danger' });
      return;
    }
    showToast({ title: 'Recuento cancelado', variant: 'success' });
  };

  return (
    <>
      <PageHeader
        title={isOpen ? 'Recuento en curso' : count.status === 'closed' ? 'Recuento cerrado' : 'Recuento cancelado'}
        back="/counts"
        actions={
          isOpen ? (
            <Button
              size="sm"
              variant="primary"
              iconStart={<CheckCheck size={16} />}
              onClick={() => setConfirmClose(true)}
            >
              Cerrar
            </Button>
          ) : null
        }
      />

      <div className="px-3 pb-2">
        <div className="rounded border border-border bg-surface px-3 py-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted">Iniciado</span>
            <span>{formatDate(count.startedAt)}</span>
          </div>
          {count.closedAt && (
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-muted">Cerrado</span>
              <span>{formatDate(count.closedAt)}</span>
            </div>
          )}
          <div className="mt-0.5 flex items-center justify-between">
            <span className="text-muted">Progreso</span>
            <span className="font-mono">
              {stats.counted}/{stats.total} contados · {stats.diff} con diferencia
            </span>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="px-3 pb-2">
          <div className="grid grid-cols-2 gap-1 rounded border border-border bg-surface p-1">
            <TabButton active={tab === 'list'} onClick={() => setTab('list')}>
              <ListIcon size={16} /> Lista
            </TabButton>
            <TabButton active={tab === 'scan'} onClick={() => setTab('scan')}>
              <ScanLine size={16} /> Escanear
            </TabButton>
          </div>
        </div>
      )}

      {tab === 'list' || !isOpen ? (
        <>
          <div className="space-y-2 px-3 pb-2">
            <Input
              aria-label="Buscar"
              placeholder="Buscar por nombre, SKU o código"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
                Todo
              </Chip>
              <Chip active={filter === 'pending'} onClick={() => setFilter('pending')}>
                Sin contar
              </Chip>
              <Chip active={filter === 'counted'} onClick={() => setFilter('counted')}>
                Contado
              </Chip>
              <Chip active={filter === 'diff'} onClick={() => setFilter('diff')}>
                Con diferencia
              </Chip>
            </div>
          </div>

          <ul className="divide-y divide-border">
            {filteredRows.map((r) => (
              <li
                key={r.productId}
                className={cn(
                  'px-3 py-3',
                  r.counted == null ? '' : r.diff === 0 ? 'bg-success/5' : r.diff > 0 ? 'bg-primary/5' : 'bg-warning/5',
                )}
              >
                <button
                  type="button"
                  onClick={() => isOpen && setEditingProductId(r.productId)}
                  className="flex w-full items-center gap-3 text-left"
                  disabled={!isOpen}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.product?.name ?? r.productId}</div>
                    <div className="truncate text-xs text-muted">
                      Esperado {formatNumber(r.expected)}
                      {r.product?.sku && ` · SKU ${r.product.sku}`}
                    </div>
                  </div>
                  <div className="text-right">
                    {r.counted == null ? (
                      <div className="text-xs text-muted">Sin contar</div>
                    ) : (
                      <>
                        <div className="font-mono text-lg">{formatNumber(r.counted)}</div>
                        {r.diff !== 0 && (
                          <div
                            className={cn(
                              'flex items-center justify-end gap-0.5 text-xs',
                              r.diff > 0 ? 'text-primary' : 'text-warning',
                            )}
                          >
                            {r.diff > 0 ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            {formatNumber(Math.abs(r.diff))}
                          </div>
                        )}
                        {r.diff === 0 && (
                          <div className="flex items-center justify-end text-xs text-success">
                            <Check size={12} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {isOpen && (
            <div className="mt-6 px-3 pb-6">
              <Button
                variant="ghost"
                iconStart={<Ban size={16} />}
                onClick={() => setConfirmCancel(true)}
              >
                Cancelar recuento
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="relative h-[60vh] overflow-hidden rounded border border-border">
          <Scanner onDetected={handleScanned} paused={!!lastScan || !!unknownCode} />
          {lastScan && (
            <LastScanBar
              product={lastScan.product}
              counted={lastScan.counted}
              expected={
                count.expectedSnapshot.find((s) => s.productId === lastScan.product.id)?.expected ?? 0
              }
              countId={count.id}
              onClose={() => setLastScan(null)}
            />
          )}
        </div>
      )}

      {editingProductId && (
        <EditCountedSheet
          row={rows.find((r) => r.productId === editingProductId)!}
          countId={count.id}
          onClose={() => setEditingProductId(null)}
        />
      )}

      <Sheet
        open={!!unknownCode}
        onOpenChange={(o) => !o && setUnknownCode(null)}
        title="Código no reconocido"
      >
        {unknownCode && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              No hay ningún producto con el código <span className="font-mono">{unknownCode}</span>.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setUnknownCode(null)} className="flex-1">
                Cerrar
              </Button>
              <Button
                className="flex-1"
                onClick={() => navigate(`/products/new?barcode=${encodeURIComponent(unknownCode)}`)}
              >
                Dar de alta
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Cerrar recuento"
        description={`Se generarán los movimientos de ajuste para ${stats.diff} producto(s) con diferencia. Esta acción no se puede deshacer.`}
        confirmLabel={closing ? 'Cerrando…' : 'Cerrar'}
        onConfirm={onClose}
      />

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancelar recuento"
        description="Se descartará el recuento sin generar ajustes. Los conteos registrados se conservarán como histórico pero sin efecto sobre el stock."
        destructive
        confirmLabel="Cancelar recuento"
        onConfirm={onCancel}
      />
    </>
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
        'flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium',
        active ? 'bg-primary text-primary-fg' : 'text-muted',
      )}
    >
      {children}
    </button>
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
      aria-pressed={active}
      className={cn(
        'flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
        active ? 'bg-primary text-primary-fg' : 'border border-border bg-surface text-muted',
      )}
    >
      {children}
    </button>
  );
}

function LastScanBar({
  product,
  counted,
  expected,
  countId,
  onClose,
}: {
  product: Product;
  counted: number;
  expected: number;
  countId: string;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(counted);

  const bump = async (delta: number) => {
    const res = await incrementCount(countId, product.id, delta);
    if (res.ok) {
      const ln = res.value.countedLines.find((l) => l.productId === product.id);
      if (ln) setQty(ln.counted);
    }
  };

  return (
    <div className="safe-bottom absolute inset-x-0 bottom-0 border-t border-border bg-bg/95 p-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{product.name}</div>
          <div className="truncate text-xs text-muted">
            Esperado {formatNumber(expected)} · SKU {product.sku}
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Restar 1"
          onClick={() => void bump(-1)}
        >
          <Minus size={18} />
        </Button>
        <span className="min-w-[3rem] text-center font-mono text-2xl">{formatNumber(qty)}</span>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Sumar 1"
          onClick={() => void bump(+1)}
        >
          <Plus size={18} />
        </Button>
      </div>
      <div className="mt-2 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Seguir escaneando
        </Button>
      </div>
    </div>
  );
}

function EditCountedSheet({
  row,
  countId,
  onClose,
}: {
  row: DerivedRow;
  countId: string;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(row.counted?.toString() ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const value = Number(qty);
    if (qty === '' || Number.isNaN(value)) {
      setBusy(false);
      showToast({ title: 'Cantidad inválida', variant: 'danger' });
      return;
    }
    const res = await setCountQuantity(countId, row.productId, value);
    setBusy(false);
    if (!res.ok) {
      showToast({ title: 'No se ha podido guardar', variant: 'danger' });
      return;
    }
    onClose();
  };

  const remove = async () => {
    setBusy(true);
    await removeCountedItem(countId, row.productId);
    setBusy(false);
    onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={row.product?.name ?? ''}>
      <div className="space-y-3">
        <div className="rounded bg-surface p-3 text-sm">
          <div className="text-xs text-muted">Esperado en este almacén</div>
          <div className="font-mono text-lg">{formatNumber(row.expected)}</div>
        </div>
        <Input
          label="Cantidad contada"
          type="number"
          inputMode="decimal"
          step="0.01"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          autoFocus
          placeholder="0"
        />
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          {row.counted != null && (
            <Button
              variant="ghost"
              onClick={remove}
              iconStart={<Trash2 size={16} />}
              disabled={busy}
            >
              Quitar
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={save} loading={busy}>
            Guardar
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
