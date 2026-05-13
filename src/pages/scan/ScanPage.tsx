import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scanner } from '@/features/scanner/Scanner';
import { Sheet } from '@/ui/Sheet';
import { Button } from '@/ui/Button';
import { showToast } from '@/ui/Toast';
import { useActiveWarehouse } from '@/state/active-warehouse';
import { productRepo, stockLevelRepo } from '@/data/repositories';
import { createMovement } from '@/domain/use-cases/createMovement';
import { createProduct } from '@/domain/use-cases/createProduct';
import { parsePayload } from '@/platform/qr';
import type { Product } from '@/domain/entities';
import { formatNumber } from '@/utils/format';
import { Minus, Plus } from 'lucide-react';

interface IncomingProduct {
  sku: string;
  name: string;
  description?: string;
  unit: string;
  barcodes: string[];
  costPrice?: number;
  salePrice?: number;
  taxRate?: number;
}

export default function ScanPage() {
  const navigate = useNavigate();
  const { active } = useActiveWarehouse();
  const [found, setFound] = useState<{
    product: Product;
    code: string;
    stock: number;
  } | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<IncomingProduct | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [busy, setBusy] = useState(false);

  const handleDetected = useCallback(
    async (code: string) => {
      if (found || unknown || incoming) return;

      // First, see if it's an Inventek-specific payload.
      const parsed = parsePayload(code);
      if (parsed.kind === 'product') {
        setIncoming(parsed.data as IncomingProduct);
        return;
      }
      if (parsed.kind === 'peer') {
        navigate(`/sync?peer=${encodeURIComponent(parsed.peerId)}`);
        return;
      }

      // Otherwise, treat as a regular product barcode lookup.
      const product = await productRepo.findByBarcode(code);
      if (!product) {
        setUnknown(code);
        return;
      }
      const lvl = active ? await stockLevelRepo.get(active.id, product.id) : undefined;
      setFound({ product, code, stock: lvl?.quantity ?? 0 });
      setQty(1);
    },
    [active, found, unknown, incoming, navigate],
  );

  const close = () => {
    setFound(null);
    setUnknown(null);
    setIncoming(null);
  };

  const apply = async (type: 'in' | 'out') => {
    if (!found || !active) return;
    setBusy(true);
    const res = await createMovement({
      type,
      warehouseId: active.id,
      reason: 'manual',
      lines: [{ productId: found.product.id, quantity: qty }],
    });
    setBusy(false);
    if (!res.ok) {
      showToast({
        title: 'No se pudo registrar',
        description: res.error.kind === 'insufficient-stock' ? 'Stock insuficiente.' : 'Error',
        variant: 'danger',
      });
      return;
    }
    showToast({
      title: type === 'in' ? `+${qty} ${found.product.name}` : `-${qty} ${found.product.name}`,
      variant: 'success',
      durationMs: 1500,
    });
    close();
  };

  const importIncoming = async () => {
    if (!incoming) return;
    setBusy(true);
    const res = await createProduct({
      sku: incoming.sku,
      name: incoming.name,
      description: incoming.description,
      unit: incoming.unit ?? 'unit',
      barcodes: incoming.barcodes ?? [],
      costPrice: incoming.costPrice,
      salePrice: incoming.salePrice,
      taxRate: incoming.taxRate,
      active: true,
    });
    setBusy(false);
    if (!res.ok) {
      if (res.error.kind === 'conflict') {
        showToast({ title: 'Ya existía', description: res.error.message, variant: 'warning' });
      } else {
        showToast({ title: 'No se pudo importar', variant: 'danger' });
      }
      return;
    }
    showToast({ title: 'Producto importado', variant: 'success' });
    close();
  };

  return (
    <div className="fixed inset-0 z-10 bg-black">
      <Scanner onDetected={handleDetected} paused={!!found || !!unknown || !!incoming} />
      <div className="safe-top absolute inset-x-0 top-0 flex items-center justify-between p-3">
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Salir
        </Button>
        {active && (
          <span className="rounded bg-black/40 px-2 py-1 text-xs text-white">{active.code}</span>
        )}
      </div>

      <Sheet open={!!found} onOpenChange={(o) => !o && close()} title={found?.product.name ?? ''}>
        {found && (
          <div className="space-y-4">
            <div className="rounded bg-surface p-3 text-sm">
              <div className="text-xs text-muted">SKU</div>
              <div className="font-mono">{found.product.sku}</div>
              <div className="mt-2 text-xs text-muted">Stock actual en {active?.code}</div>
              <div className="font-mono text-lg">{formatNumber(found.stock)}</div>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setQty(Math.max(1, qty - 1))}
                aria-label="Restar 1"
              >
                <Minus size={20} />
              </Button>
              <input
                type="number"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(Number(e.target.value) || 0)}
                className="h-14 w-24 rounded border border-border bg-surface text-center font-mono text-2xl"
              />
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setQty(qty + 1)}
                aria-label="Sumar 1"
              >
                <Plus size={20} />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button loading={busy} onClick={() => apply('out')}>
                Salida −{qty}
              </Button>
              <Button loading={busy} onClick={() => apply('in')}>
                Entrada +{qty}
              </Button>
            </div>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => navigate(`/products/${found.product.id}`)}
            >
              Ver ficha del producto
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!unknown} onOpenChange={(o) => !o && close()} title="Código no reconocido">
        {unknown && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              No hay ningún producto con el código <span className="font-mono">{unknown}</span>.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={close} className="flex-1">
                Cerrar
              </Button>
              <Button
                className="flex-1"
                onClick={() => navigate(`/products/new?barcode=${encodeURIComponent(unknown)}`)}
              >
                Dar de alta
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet
        open={!!incoming}
        onOpenChange={(o) => !o && close()}
        title="Importar producto"
        description="Recibido por QR"
      >
        {incoming && (
          <div className="space-y-3">
            <div className="rounded bg-surface p-3 text-sm">
              <div className="font-medium">{incoming.name}</div>
              <div className="mt-1 text-xs text-muted">SKU {incoming.sku}</div>
              {incoming.barcodes.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {incoming.barcodes.map((b) => (
                    <span key={b} className="rounded bg-surface2 px-1.5 py-0.5 font-mono text-[10px]">
                      {b}
                    </span>
                  ))}
                </div>
              )}
              {incoming.description && (
                <p className="mt-2 text-xs text-muted">{incoming.description}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={close} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={importIncoming} loading={busy} className="flex-1">
                Importar
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
