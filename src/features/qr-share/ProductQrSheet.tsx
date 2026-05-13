import { useEffect, useState } from 'react';
import { Sheet } from '@/ui/Sheet';
import { encodeProductPayload, renderQrDataUrl } from '@/platform/qr';
import type { Product } from '@/domain/entities';

/**
 * Renders a sharable QR for a product. The payload is the product entity
 * with imageBlob stripped (otherwise it'd overflow the QR capacity).
 */
export function ProductQrSheet({
  product,
  open,
  onOpenChange,
}: {
  product: Product;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Strip heavy fields. The receiving device can scan the product later
    // to attach its own image.
    const { imageBlob: _img, ...slim } = product;
    void _img;
    const payload = encodeProductPayload(slim);
    if (payload.length > 1800) {
      setError(
        `El payload es demasiado grande para un QR (${payload.length} bytes). Reduce campos del producto.`,
      );
      setQrUrl(null);
      return;
    }
    setError(null);
    void renderQrDataUrl(payload, { width: 320 }).then(setQrUrl).catch((e) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [product, open]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Compartir producto"
      description={product.name}
    >
      <div className="space-y-3">
        {error && <div className="rounded bg-danger/10 p-2 text-sm text-danger">{error}</div>}
        {qrUrl && (
          <div className="rounded bg-white p-3 text-center">
            <img src={qrUrl} alt="QR del producto" className="mx-auto h-72 w-72" />
          </div>
        )}
        <p className="text-xs text-muted">
          Escanea este código desde otro dispositivo con Inventek (desde "Escanear") para
          dar de alta el mismo producto. La imagen no se incluye para que quepa en el QR.
        </p>
      </div>
    </Sheet>
  );
}
