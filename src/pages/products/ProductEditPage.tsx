import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { db } from '@/data/db';
import { Button } from '@/ui/Button';
import { Input, Textarea } from '@/ui/Input';
import { PageHeader } from '@/ui/PageHeader';
import { BlobImage } from '@/ui/BlobImage';
import { showToast } from '@/ui/Toast';
import { createProduct, updateProduct } from '@/domain/use-cases/createProduct';
import { compressImage } from '@/platform/image';
import type { Product } from '@/domain/entities';
import { X, Camera, ImagePlus } from 'lucide-react';

export default function ProductEditPage() {
  const { id } = useParams<{ id?: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const editing = !!id;

  const [loaded, setLoaded] = useState(false);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('unit');
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [newBarcode, setNewBarcode] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [imageBlob, setImageBlob] = useState<Blob | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    if (!editing) {
      const initialBarcode = params.get('barcode');
      if (initialBarcode) setBarcodes([initialBarcode]);
      setLoaded(true);
      return;
    }
    void db.products.get(id!).then((p) => {
      if (cancel || !p) return;
      setSku(p.sku);
      setName(p.name);
      setDescription(p.description ?? '');
      setUnit(p.unit);
      setBarcodes(p.barcodes);
      setCostPrice(p.costPrice?.toString() ?? '');
      setSalePrice(p.salePrice?.toString() ?? '');
      setImageBlob(p.imageBlob);
      setLoaded(true);
    });
    return () => {
      cancel = true;
    };
  }, [id, editing, params]);

  if (!loaded) {
    return (
      <>
        <PageHeader title={editing ? 'Editar producto' : 'Nuevo producto'} back="/products" />
        <div className="p-3 text-muted">Cargando…</div>
      </>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload = {
      sku: sku.trim(),
      name: name.trim(),
      description: description.trim() || undefined,
      unit,
      barcodes,
      costPrice: costPrice ? Number(costPrice) : undefined,
      salePrice: salePrice ? Number(salePrice) : undefined,
      active: true,
      imageBlob,
    };
    const res = editing
      ? await updateProduct(id!, payload)
      : await createProduct(payload);
    setBusy(false);
    if (!res.ok) {
      const e = res.error;
      setError(
        e.kind === 'conflict'
          ? e.message
          : e.kind === 'validation'
            ? e.message
            : 'Error al guardar',
      );
      return;
    }
    showToast({ title: editing ? 'Producto actualizado' : 'Producto creado', variant: 'success' });
    navigate(`/products/${(res.value as Product).id}`);
  };

  const addBarcode = () => {
    const b = newBarcode.trim();
    if (!b) return;
    if (barcodes.includes(b)) return;
    setBarcodes([...barcodes, b]);
    setNewBarcode('');
  };

  return (
    <>
      <PageHeader title={editing ? 'Editar producto' : 'Nuevo producto'} back="/products" />

      <div className="space-y-3 px-3">
        <ImageField imageBlob={imageBlob} onChange={setImageBlob} />
        <Input label="SKU" required value={sku} onChange={(e) => setSku(e.target.value)} maxLength={64} />
        <Input label="Nombre" required value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea
          label="Descripción"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Unidad</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="h-11 w-full rounded border border-border bg-surface px-3"
          >
            <option value="unit">Unidad</option>
            <option value="kg">Kilogramos (kg)</option>
            <option value="g">Gramos (g)</option>
            <option value="l">Litros (l)</option>
            <option value="ml">Mililitros (ml)</option>
            <option value="m">Metros (m)</option>
            <option value="box">Caja</option>
          </select>
        </label>

        <div>
          <span className="mb-1 block text-sm font-medium">Códigos de barras</span>
          <div className="flex flex-wrap gap-2">
            {barcodes.map((b) => (
              <span
                key={b}
                className="inline-flex items-center gap-1 rounded bg-surface2 px-2 py-1 text-sm"
              >
                {b}
                <button
                  type="button"
                  aria-label={`Quitar ${b}`}
                  onClick={() => setBarcodes(barcodes.filter((x) => x !== b))}
                  className="text-muted hover:text-danger"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className="h-10 flex-1 rounded border border-border bg-surface px-3 text-sm"
              placeholder="Escribir o pegar código"
              value={newBarcode}
              onChange={(e) => setNewBarcode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBarcode())}
            />
            <Button size="sm" variant="secondary" onClick={addBarcode}>
              Añadir
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Precio coste"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
          />
          <Input
            label="Precio venta"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
          />
        </div>

        {error && <div className="rounded bg-danger/10 p-2 text-sm text-danger">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => navigate(-1)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy} disabled={!sku.trim() || !name.trim()}>
            Guardar
          </Button>
        </div>
      </div>
    </>
  );
}

function ImageField({
  imageBlob,
  onChange,
}: {
  imageBlob: Blob | undefined;
  onChange: (b: Blob | undefined) => void;
}) {
  const [busy, setBusy] = useState(false);

  const pickImage = (capture: boolean) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setBusy(true);
      try {
        const compressed = await compressImage(f, { maxSize: 800, quality: 0.8 });
        onChange(compressed);
      } catch (e) {
        showToast({ title: 'No se ha podido procesar la imagen', description: String(e), variant: 'danger' });
      } finally {
        setBusy(false);
      }
    };
    document.body.appendChild(input);
    input.click();
    input.remove();
  };

  return (
    <div>
      <span className="mb-1 block text-sm font-medium">Imagen</span>
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surface">
          {imageBlob ? (
            <BlobImage blob={imageBlob} alt="Producto" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus size={24} className="text-muted" aria-hidden />
          )}
        </div>
        <div className="flex flex-1 flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            iconStart={<Camera size={16} />}
            onClick={() => pickImage(true)}
            loading={busy}
          >
            Cámara
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            iconStart={<ImagePlus size={16} />}
            onClick={() => pickImage(false)}
            loading={busy}
          >
            Galería
          </Button>
          {imageBlob && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              iconStart={<X size={16} />}
              onClick={() => onChange(undefined)}
            >
              Quitar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
