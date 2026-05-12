import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/db';
import { Button } from '@/ui/Button';
import { Input, Textarea } from '@/ui/Input';
import { PageHeader } from '@/ui/PageHeader';
import { showToast } from '@/ui/Toast';
import { createMovement } from '@/domain/use-cases/createMovement';
import { useActiveWarehouse } from '@/state/active-warehouse';
import type { MovementType, Product, Warehouse } from '@/domain/entities';
import { X, ScanLine } from 'lucide-react';
import { Link } from 'react-router-dom';

const REASONS: Record<MovementType, Array<{ value: string; label: string }>> = {
  in: [
    { value: 'purchase', label: 'Compra' },
    { value: 'return-customer', label: 'Devolución cliente' },
    { value: 'adjust-positive', label: 'Ajuste positivo' },
    { value: 'manual', label: 'Manual' },
  ],
  out: [
    { value: 'sale', label: 'Venta' },
    { value: 'consumption', label: 'Consumo interno' },
    { value: 'shrinkage', label: 'Merma' },
    { value: 'manual', label: 'Manual' },
  ],
  transfer: [{ value: 'transfer', label: 'Transferencia' }],
  adjust: [
    { value: 'count-adjust', label: 'Ajuste por recuento' },
    { value: 'manual', label: 'Manual' },
  ],
};

interface LineDraft {
  productId: string;
  quantity: string;
  notes?: string;
}

export default function NewMovementPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initialType = (params.get('type') as MovementType) ?? 'in';
  const initialProductId = params.get('productId') ?? undefined;

  const { active, warehouses } = useActiveWarehouse();

  const [type, setType] = useState<MovementType>(initialType);
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState<string>('');
  const [reason, setReason] = useState<string>(REASONS[initialType][0]?.value ?? 'manual');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>(
    initialProductId ? [{ productId: initialProductId, quantity: '1' }] : [],
  );
  const [productPicker, setProductPicker] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!warehouseId && active) setWarehouseId(active.id);
  }, [active, warehouseId]);

  useEffect(() => {
    const opts = REASONS[type];
    if (!opts.some((r) => r.value === reason)) setReason(opts[0]?.value ?? 'manual');
  }, [type, reason]);

  const products = useLiveQuery(
    () => db.products.filter((p) => !p.deletedAt).toArray(),
    [],
    [] as Product[],
  );

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const filteredForPicker = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 50);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcodes.some((b) => b.toLowerCase().includes(q)),
      )
      .slice(0, 50);
  }, [products, productQuery]);

  const submit = async () => {
    setError(null);
    setBusy(true);
    const payload = {
      type,
      warehouseId: warehouseId || undefined,
      destinationWarehouseId: type === 'transfer' ? destinationWarehouseId : undefined,
      reason,
      notes: notes.trim() || undefined,
      lines: lines.map((l) => ({
        productId: l.productId,
        quantity: Number(l.quantity || '0'),
        notes: l.notes,
      })),
    };
    const res = await createMovement(payload);
    setBusy(false);
    if (!res.ok) {
      const e = res.error;
      const msg =
        e.kind === 'insufficient-stock'
          ? `Stock insuficiente: ${e.available} disponible, ${e.requested} solicitado.`
          : e.kind === 'validation'
            ? e.message
            : e.kind === 'not-found'
              ? `${e.entity} no encontrado`
              : 'Error al guardar';
      setError(msg);
      return;
    }
    showToast({ title: 'Movimiento registrado', variant: 'success' });
    navigate('/movements');
  };

  return (
    <>
      <PageHeader title="Nuevo movimiento" back="/movements" />

      <div className="space-y-3 px-3">
        <div role="tablist" className="grid grid-cols-4 gap-1 rounded border border-border bg-surface p-1">
          {(['in', 'out', 'transfer', 'adjust'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={t === type}
              onClick={() => setType(t)}
              className={
                t === type
                  ? 'rounded bg-primary px-2 py-1.5 text-sm font-medium text-primary-fg'
                  : 'rounded px-2 py-1.5 text-sm text-muted'
              }
            >
              {t === 'in' && 'Entrada'}
              {t === 'out' && 'Salida'}
              {t === 'transfer' && 'Transfer.'}
              {t === 'adjust' && 'Ajuste'}
            </button>
          ))}
        </div>

        <WarehouseSelect
          label={type === 'transfer' ? 'Origen' : 'Almacén'}
          value={warehouseId}
          onChange={setWarehouseId}
          warehouses={warehouses}
        />
        {type === 'transfer' && (
          <WarehouseSelect
            label="Destino"
            value={destinationWarehouseId}
            onChange={setDestinationWarehouseId}
            warehouses={warehouses.filter((w) => w.id !== warehouseId)}
          />
        )}

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Motivo</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-11 w-full rounded border border-border bg-surface px-3"
          >
            {REASONS[type].map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium">Líneas</span>
            <div className="flex gap-2">
              <Link to="/scan?picker=1" aria-label="Escanear">
                <Button size="sm" variant="secondary" iconStart={<ScanLine size={16} />}>Escáner</Button>
              </Link>
              <Button size="sm" variant="secondary" onClick={() => setProductPicker(true)}>
                Añadir producto
              </Button>
            </div>
          </div>
          {lines.length === 0 ? (
            <div className="rounded border border-dashed border-border p-4 text-center text-sm text-muted">
              Añade al menos un producto.
            </div>
          ) : (
            <ul className="space-y-2">
              {lines.map((l, i) => {
                const p = productMap.get(l.productId);
                return (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded border border-border bg-surface p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{p?.name ?? '—'}</div>
                      <div className="truncate text-xs text-muted">{p?.sku}</div>
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      className="h-10 w-24 rounded border border-border bg-bg px-2 text-right font-mono"
                      value={l.quantity}
                      onChange={(e) => {
                        const next = [...lines];
                        next[i] = { ...l, quantity: e.target.value };
                        setLines(next);
                      }}
                    />
                    <button
                      type="button"
                      aria-label="Quitar línea"
                      onClick={() => setLines(lines.filter((_, j) => j !== i))}
                      className="text-muted hover:text-danger"
                    >
                      <X size={18} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Textarea label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />

        {error && <div className="rounded bg-danger/10 p-2 text-sm text-danger">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => navigate(-1)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            loading={busy}
            disabled={
              !warehouseId ||
              lines.length === 0 ||
              lines.some((l) => !l.quantity || Number(l.quantity) <= 0) ||
              (type === 'transfer' && !destinationWarehouseId)
            }
          >
            Confirmar
          </Button>
        </div>
      </div>

      {productPicker && (
        <ProductPicker
          query={productQuery}
          onQueryChange={setProductQuery}
          products={filteredForPicker}
          onPick={(p) => {
            if (!lines.find((l) => l.productId === p.id)) {
              setLines([...lines, { productId: p.id, quantity: '1' }]);
            }
            setProductPicker(false);
          }}
          onClose={() => setProductPicker(false)}
        />
      )}
    </>
  );
}

function WarehouseSelect({
  label,
  value,
  onChange,
  warehouses,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  warehouses: Warehouse[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded border border-border bg-surface px-3"
      >
        <option value="">— seleccionar —</option>
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.code} · {w.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProductPicker({
  query,
  onQueryChange,
  products,
  onPick,
  onClose,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  products: Product[];
  onPick: (p: Product) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg">
      <div className="safe-top flex items-center gap-2 border-b border-border p-3">
        <Input
          autoFocus
          placeholder="Buscar producto…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      </div>
      <ul className="flex-1 divide-y divide-border overflow-y-auto">
        {products.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className="block w-full px-3 py-3 text-left hover:bg-surface"
            >
              <div className="truncate font-medium">{p.name}</div>
              <div className="truncate text-xs text-muted">SKU {p.sku}</div>
            </button>
          </li>
        ))}
        {products.length === 0 && (
          <li className="p-4 text-center text-sm text-muted">Sin resultados</li>
        )}
      </ul>
    </div>
  );
}
