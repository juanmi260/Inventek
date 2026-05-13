import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/db';
import { Button } from '@/ui/Button';
import { Textarea } from '@/ui/Input';
import { PageHeader } from '@/ui/PageHeader';
import { showToast } from '@/ui/Toast';
import { startStockCount } from '@/domain/use-cases/stockCount';
import { useActiveWarehouse } from '@/state/active-warehouse';
import type { Warehouse } from '@/domain/entities';

export default function NewCountPage() {
  const navigate = useNavigate();
  const { active } = useActiveWarehouse();
  const warehouses = useLiveQuery(
    () => db.warehouses.filter((w) => !w.deletedAt && !w.archived).toArray(),
    [],
    [] as Warehouse[],
  );

  const [warehouseId, setWarehouseId] = useState<string>('');
  const [scope, setScope] = useState<'full' | 'partial'>('full');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!warehouseId && active) setWarehouseId(active.id);
  }, [active, warehouseId]);

  const productCount = useLiveQuery(
    () => (warehouseId ? db.stockLevels.where('warehouseId').equals(warehouseId).count() : 0),
    [warehouseId],
    0,
  );

  const submit = async () => {
    if (!warehouseId) {
      setError('Selecciona un almacén');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await startStockCount({
      warehouseId,
      scope,
      notes: notes.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.kind === 'not-found' ? 'Almacén no encontrado' : 'Error al iniciar');
      return;
    }
    showToast({ title: 'Recuento iniciado', variant: 'success' });
    navigate(`/counts/${res.value.id}`);
  };

  return (
    <>
      <PageHeader title="Nuevo recuento" back="/counts" />
      <div className="space-y-3 px-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Almacén</span>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
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

        <div>
          <span className="mb-1 block text-sm font-medium">Alcance</span>
          <div className="grid grid-cols-2 gap-2">
            <ScopeButton
              active={scope === 'full'}
              onClick={() => setScope('full')}
              title="Completo"
              description="Recorre todo el stock del almacén."
            />
            <ScopeButton
              active={scope === 'partial'}
              onClick={() => setScope('partial')}
              title="Parcial"
              description="Solo lo que escanees. Útil para spot-checks."
            />
          </div>
        </div>

        {warehouseId && (
          <div className="rounded border border-border bg-surface px-3 py-2 text-sm text-muted">
            {productCount === 0
              ? 'Sin stock previo en este almacén. El recuento partirá de cero.'
              : `Se hará un snapshot de ${productCount} productos con stock actual.`}
          </div>
        )}

        <Textarea
          label="Notas"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="P. ej. recuento mensual mayo"
        />

        {error && <div className="rounded bg-danger/10 p-2 text-sm text-danger">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => navigate(-1)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy} disabled={!warehouseId}>
            Iniciar
          </Button>
        </div>
      </div>
    </>
  );
}

function ScopeButton({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'rounded border border-primary bg-primary/10 p-3 text-left'
          : 'rounded border border-border bg-surface p-3 text-left hover:bg-surface2'
      }
    >
      <div className="font-medium">{title}</div>
      <div className="text-xs text-muted">{description}</div>
    </button>
  );
}
