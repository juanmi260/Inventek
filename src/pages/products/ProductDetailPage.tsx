import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/db';
import { Button } from '@/ui/Button';
import { PageHeader } from '@/ui/PageHeader';
import {
  Pencil,
  Trash2,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowRightLeft,
  Settings2,
  AlertTriangle,
  QrCode,
} from 'lucide-react';
import { ProductQrSheet } from '@/features/qr-share/ProductQrSheet';
import { formatNumber } from '@/utils/format';
import { productRepo } from '@/data/repositories';
import { showToast } from '@/ui/Toast';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Sheet } from '@/ui/Sheet';
import { Input } from '@/ui/Input';
import { BlobImage } from '@/ui/BlobImage';
import { setStockLimits } from '@/domain/use-cases/setStockLimits';
import { useMemo, useState } from 'react';
import type { Product, StockLevel, Warehouse } from '@/domain/entities';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [askDelete, setAskDelete] = useState(false);
  const [shareQr, setShareQr] = useState(false);
  const [limitsFor, setLimitsFor] = useState<{ warehouse: Warehouse; level?: StockLevel } | null>(
    null,
  );

  const product = useLiveQuery(
    () => (id ? db.products.get(id) : undefined),
    [id],
  ) as Product | undefined;
  const levels = useLiveQuery(
    () => (id ? db.stockLevels.where('productId').equals(id).toArray() : []),
    [id],
    [] as StockLevel[],
  );
  const warehouses = useLiveQuery(
    () => db.warehouses.filter((w) => !w.deletedAt && !w.archived).toArray(),
    [],
    [] as Warehouse[],
  );

  // Compose a row per active warehouse, even if no StockLevel exists yet.
  const rows = useMemo(() => {
    const byKey = new Map(levels.map((l) => [l.warehouseId, l]));
    return warehouses.map((w) => ({ warehouse: w, level: byKey.get(w.id) }));
  }, [warehouses, levels]);

  if (!product) {
    return (
      <>
        <PageHeader title="Producto" back="/products" />
        <div className="p-3 text-muted">Cargando…</div>
      </>
    );
  }

  const total = levels.reduce((acc, l) => acc + l.quantity, 0);

  return (
    <>
      <PageHeader
        title={product.name}
        back="/products"
        actions={
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="secondary"
              aria-label="Compartir QR"
              onClick={() => setShareQr(true)}
            >
              <QrCode size={16} />
            </Button>
            <Link to={`/products/${product.id}/edit`} aria-label="Editar">
              <Button size="sm" variant="secondary" iconStart={<Pencil size={16} />}>
                Editar
              </Button>
            </Link>
          </div>
        }
      />

      <div className="px-3">
        {product.imageBlob && (
          <div className="mb-3 overflow-hidden rounded border border-border bg-surface">
            <BlobImage
              blob={product.imageBlob}
              alt={product.name}
              className="block max-h-72 w-full object-cover"
            />
          </div>
        )}
        <div className="rounded border border-border bg-surface p-3">
          <div className="text-xs text-muted">SKU</div>
          <div className="font-mono">{product.sku}</div>
          {product.barcodes.length > 0 && (
            <>
              <div className="mt-2 text-xs text-muted">Códigos</div>
              <div className="flex flex-wrap gap-1">
                {product.barcodes.map((b) => (
                  <span key={b} className="rounded bg-surface2 px-2 py-0.5 font-mono text-xs">
                    {b}
                  </span>
                ))}
              </div>
            </>
          )}
          {product.description && (
            <>
              <div className="mt-2 text-xs text-muted">Descripción</div>
              <p className="text-sm">{product.description}</p>
            </>
          )}
        </div>

        <h2 className="mt-4 px-1 text-sm font-semibold uppercase tracking-wide text-muted">
          Stock por almacén · total {formatNumber(total)}
        </h2>
        {rows.length === 0 ? (
          <div className="mt-2 rounded border border-dashed border-border p-4 text-center text-sm text-muted">
            No hay almacenes activos.
          </div>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {rows.map(({ warehouse: w, level: l }) => {
              const qty = l?.quantity ?? 0;
              const min = l?.minStock;
              const low = min != null && qty < min;
              return (
                <li
                  key={w.id}
                  className={
                    'flex items-center justify-between rounded border bg-surface px-3 py-2 ' +
                    (low ? 'border-warning/40 bg-warning/5' : 'border-border')
                  }
                >
                  <button
                    type="button"
                    onClick={() => setLimitsFor({ warehouse: w, level: l })}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-1 truncate font-medium">
                      {w.name}
                      {low && <AlertTriangle size={14} className="text-warning" aria-label="Bajo mínimo" />}
                    </div>
                    <div className="text-xs text-muted">
                      {l?.location ?? '—'}
                      {min != null && ` · mín ${formatNumber(min)}`}
                      {l?.maxStock != null && ` · máx ${formatNumber(l.maxStock)}`}
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="font-mono text-lg">{formatNumber(qty)}</div>
                    <button
                      type="button"
                      onClick={() => setLimitsFor({ warehouse: w, level: l })}
                      aria-label={`Configurar mín/máx en ${w.name}`}
                      className="text-muted hover:text-text"
                    >
                      <Settings2 size={18} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link to={`/movements/new?type=in&productId=${product.id}`}>
            <Button variant="secondary" className="w-full" iconStart={<ArrowDownToLine size={18} />}>
              Entrada
            </Button>
          </Link>
          <Link to={`/movements/new?type=out&productId=${product.id}`}>
            <Button variant="secondary" className="w-full" iconStart={<ArrowUpFromLine size={18} />}>
              Salida
            </Button>
          </Link>
          <Link to={`/movements/new?type=transfer&productId=${product.id}`} className="col-span-2">
            <Button variant="secondary" className="w-full" iconStart={<ArrowRightLeft size={18} />}>
              Transferir
            </Button>
          </Link>
        </div>

        <div className="mt-6">
          <Button variant="ghost" iconStart={<Trash2 size={16} />} onClick={() => setAskDelete(true)}>
            Eliminar producto
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={askDelete}
        onOpenChange={setAskDelete}
        title="Eliminar producto"
        description="El producto se marcará como eliminado. Sus movimientos pasados se conservarán."
        destructive
        confirmLabel="Eliminar"
        onConfirm={async () => {
          await productRepo.remove(product.id);
          showToast({ title: 'Producto eliminado', variant: 'success' });
          navigate('/products');
        }}
      />

      {limitsFor && (
        <LimitsSheet
          product={product}
          warehouse={limitsFor.warehouse}
          level={limitsFor.level}
          onClose={() => setLimitsFor(null)}
        />
      )}

      <ProductQrSheet product={product} open={shareQr} onOpenChange={setShareQr} />
    </>
  );
}

function LimitsSheet({
  product,
  warehouse,
  level,
  onClose,
}: {
  product: Product;
  warehouse: Warehouse;
  level?: StockLevel;
  onClose: () => void;
}) {
  const [minStock, setMinStock] = useState(level?.minStock?.toString() ?? '');
  const [maxStock, setMaxStock] = useState(level?.maxStock?.toString() ?? '');
  const [location, setLocation] = useState(level?.location ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await setStockLimits({
      productId: product.id,
      warehouseId: warehouse.id,
      minStock: minStock === '' ? null : Number(minStock),
      maxStock: maxStock === '' ? null : Number(maxStock),
      location: location.trim() === '' ? null : location.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.kind === 'validation' ? res.error.message : 'Error al guardar');
      return;
    }
    showToast({ title: 'Guardado', variant: 'success' });
    onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={`${warehouse.name}`} description={product.name}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Stock mínimo"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
            placeholder="Sin alerta"
            hint="Alerta en el dashboard cuando el stock baja de aquí."
          />
          <Input
            label="Stock máximo"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={maxStock}
            onChange={(e) => setMaxStock(e.target.value)}
            placeholder="Sin alerta"
          />
        </div>
        <Input
          label="Ubicación interna"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="P. ej. Pasillo 3, Estante B"
        />

        {error && <div className="rounded bg-danger/10 p-2 text-sm text-danger">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy}>
            Guardar
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
