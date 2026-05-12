import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/db';
import { Button } from '@/ui/Button';
import { PageHeader } from '@/ui/PageHeader';
import { Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine, ArrowRightLeft } from 'lucide-react';
import { formatNumber } from '@/utils/format';
import { productRepo } from '@/data/repositories';
import { showToast } from '@/ui/Toast';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { useState } from 'react';
import type { Product, StockLevel, Warehouse } from '@/domain/entities';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [askDelete, setAskDelete] = useState(false);

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
    () => db.warehouses.filter((w) => !w.deletedAt).toArray(),
    [],
    [] as Warehouse[],
  );

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
          <>
            <Link to={`/products/${product.id}/edit`} aria-label="Editar">
              <Button size="sm" variant="secondary" iconStart={<Pencil size={16} />}>
                Editar
              </Button>
            </Link>
          </>
        }
      />

      <div className="px-3">
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
        {levels.length === 0 ? (
          <div className="mt-2 rounded border border-dashed border-border p-4 text-center text-sm text-muted">
            Aún no hay stock registrado.
          </div>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {levels.map((l) => {
              const w = warehouses.find((x) => x.id === l.warehouseId);
              return (
                <li
                  key={l.id}
                  className="flex items-center justify-between rounded border border-border bg-surface px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{w?.name ?? l.warehouseId}</div>
                    {l.location && <div className="text-xs text-muted">{l.location}</div>}
                  </div>
                  <div className="font-mono text-lg">{formatNumber(l.quantity)}</div>
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
    </>
  );
}
