import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDeferredValue, useState } from 'react';
import { db } from '@/data/db';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { PageHeader } from '@/ui/PageHeader';
import { EmptyState } from '@/ui/EmptyState';
import { Plus, Package } from 'lucide-react';
import { BlobImage } from '@/ui/BlobImage';
import { ExportMenu } from '@/ui/ExportMenu';
import type { Product } from '@/domain/entities';

export default function ProductsPage() {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const products = useLiveQuery(async () => {
    const all = await db.products.filter((p) => !p.deletedAt).toArray();
    const q = deferred.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcodes.some((b) => b.toLowerCase().includes(q)),
    );
  }, [deferred], [] as Product[]);

  return (
    <>
      <PageHeader
        title="Productos"
        actions={
          <div className="flex gap-1">
            <ExportMenu target="catalog" />
            <Link to="/products/new">
              <Button size="sm" iconStart={<Plus size={18} />}>Nuevo</Button>
            </Link>
          </div>
        }
      />

      <div className="px-3 pb-2">
        <Input
          aria-label="Buscar productos"
          placeholder="Buscar por nombre, SKU o código"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={<Package size={40} />}
          title={query ? 'Sin resultados' : 'No hay productos'}
          description={query ? 'Prueba con otro término.' : 'Crea tu primer producto para empezar.'}
          action={
            !query ? (
              <Link to="/products/new">
                <Button>Crear producto</Button>
              </Link>
            ) : null
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {products.map((p) => (
            <li key={p.id}>
              <Link
                to={`/products/${p.id}`}
                className="flex items-center gap-3 px-3 py-3 hover:bg-surface"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-surface2 text-muted">
                  {p.imageBlob ? (
                    <BlobImage blob={p.imageBlob} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Package size={18} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="truncate text-xs text-muted">
                    SKU: {p.sku}
                    {p.barcodes.length > 0 && ` · ${p.barcodes[0]}`}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
