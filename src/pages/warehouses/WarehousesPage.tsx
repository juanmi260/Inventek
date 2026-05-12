import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/data/db';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Input, Textarea } from '@/ui/Input';
import { PageHeader } from '@/ui/PageHeader';
import { EmptyState } from '@/ui/EmptyState';
import { showToast } from '@/ui/Toast';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Plus, Warehouse as WarehouseIcon, Star, Trash2 } from 'lucide-react';
import { createWarehouse, updateWarehouse } from '@/domain/use-cases/createWarehouse';
import { warehouseRepo } from '@/data/repositories';
import type { Warehouse } from '@/domain/entities';

export default function WarehousesPage() {
  const warehouses = useLiveQuery(
    () => db.warehouses.filter((w) => !w.deletedAt).toArray(),
    [],
    [] as Warehouse[],
  );

  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Warehouse | null>(null);

  return (
    <>
      <PageHeader
        title="Almacenes"
        actions={
          <Button size="sm" iconStart={<Plus size={18} />} onClick={() => setCreating(true)}>
            Nuevo
          </Button>
        }
      />

      <div className="px-3">
        {warehouses.length === 0 ? (
          <EmptyState
            icon={<WarehouseIcon size={40} />}
            title="Crea tu primer almacén"
            description="Necesitas al menos un almacén para registrar stock y movimientos."
            action={<Button onClick={() => setCreating(true)}>Crear almacén</Button>}
          />
        ) : (
          <ul className="space-y-2">
            {warehouses.map((w) => (
              <li
                key={w.id}
                className="flex items-center gap-3 rounded border border-border bg-surface p-3"
              >
                <span
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded font-mono text-sm"
                  style={{ background: w.color ?? 'var(--surface-2)', color: '#fff' }}
                >
                  {w.code.slice(0, 3).toUpperCase()}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(w)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{w.name}</span>
                    {w.isDefault && <Star size={14} className="text-warning" aria-label="Predeterminado" />}
                  </div>
                  {w.address && <div className="truncate text-xs text-muted">{w.address}</div>}
                </button>
                <button
                  type="button"
                  aria-label="Eliminar"
                  onClick={() => setToDelete(w)}
                  className="text-muted hover:text-danger"
                >
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(creating || editing) && (
        <WarehouseSheet
          warehouse={editing}
          open
          onOpenChange={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Eliminar "${toDelete?.name ?? ''}"`}
        description="Se archivará el almacén. Sus movimientos se conservarán pero ya no podrás registrar stock en él."
        destructive
        confirmLabel="Eliminar"
        onConfirm={async () => {
          if (!toDelete) return;
          await warehouseRepo.remove(toDelete.id);
          showToast({ title: 'Almacén eliminado', variant: 'success' });
        }}
      />
    </>
  );
}

function WarehouseSheet({
  warehouse,
  open,
  onOpenChange,
}: {
  warehouse: Warehouse | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [code, setCode] = useState(warehouse?.code ?? '');
  const [name, setName] = useState(warehouse?.name ?? '');
  const [address, setAddress] = useState(warehouse?.address ?? '');
  const [notes, setNotes] = useState(warehouse?.notes ?? '');
  const [color, setColor] = useState(warehouse?.color ?? '#0f766e');
  const [isDefault, setIsDefault] = useState(warehouse?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
      color,
      isDefault,
      archived: false,
    };
    const res = warehouse
      ? await updateWarehouse(warehouse.id, payload)
      : await createWarehouse(payload);
    setBusy(false);
    if (!res.ok) {
      setError(res.error.kind === 'conflict' ? res.error.message : res.error.kind === 'validation' ? res.error.message : 'Error al guardar');
      return;
    }
    showToast({ title: warehouse ? 'Almacén actualizado' : 'Almacén creado', variant: 'success' });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={warehouse ? 'Editar almacén' : 'Nuevo almacén'}>
      <div className="space-y-3">
        <Input
          label="Código"
          required
          maxLength={16}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="CEN"
          hint="Identificador corto, único."
        />
        <Input
          label="Nombre"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Almacén central"
        />
        <Input
          label="Dirección"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <Textarea label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Color</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-20 rounded border border-border bg-surface"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          <span className="text-sm">Marcar como predeterminado</span>
        </label>

        {error && <div className="rounded bg-danger/10 p-2 text-sm text-danger">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy} disabled={!code.trim() || !name.trim()}>
            Guardar
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
