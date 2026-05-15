import { db } from '@/data/db';
import { newId } from '@/utils/ulid';
import { nowIso } from '@/utils/format';
import { err, ok, type Result } from '@/utils/result';
import { warehouseInputSchema, type WarehouseInput } from '../schemas';
import type { Warehouse } from '../entities';
import { appendEvent, buildWarehouseEvent } from './syncEvents';

export async function createWarehouse(input: WarehouseInput): Promise<Result<Warehouse>> {
  const parsed = warehouseInputSchema.safeParse(input);
  if (!parsed.success) {
    return err({ kind: 'validation', message: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const data = parsed.data;
  try {
    return await db.transaction('rw', [db.warehouses, db.syncEvents], async (tx) => {
      const dup = await db.warehouses.where('code').equalsIgnoreCase(data.code).first();
      if (dup && !dup.deletedAt) {
        return err({ kind: 'conflict', message: `Ya existe un almacén con código "${data.code}"` });
      }
      const now = nowIso();
      const w: Warehouse = {
        id: newId(),
        code: data.code,
        name: data.name,
        address: data.address,
        notes: data.notes,
        color: data.color,
        icon: data.icon,
        isDefault: data.isDefault,
        archived: false,
        createdAt: now,
        updatedAt: now,
      };
      if (w.isDefault) {
        const existing = await db.warehouses.toArray();
        for (const e of existing) {
          if (e.isDefault) {
            const demoted = { ...e, isDefault: false, updatedAt: now };
            await db.warehouses.put(demoted);
            await appendEvent(buildWarehouseEvent(demoted), tx);
          }
        }
      }
      await db.warehouses.put(w);
      // First warehouse is always default
      const count = await db.warehouses.filter((x) => !x.deletedAt).count();
      if (count === 1 && !w.isDefault) {
        w.isDefault = true;
        await db.warehouses.put(w);
      }
      await appendEvent(buildWarehouseEvent(w), tx);
      return ok(w);
    });
  } catch (cause) {
    return err({ kind: 'storage-failure', cause });
  }
}

export async function updateWarehouse(
  id: string,
  patch: Partial<WarehouseInput>,
): Promise<Result<Warehouse>> {
  try {
    return await db.transaction('rw', [db.warehouses, db.syncEvents], async (tx) => {
      const existing = await db.warehouses.get(id);
      if (!existing || existing.deletedAt) {
        return err({ kind: 'not-found', entity: 'warehouse', id });
      }
      const now = nowIso();
      const next = { ...existing, ...patch, id, updatedAt: now } as Warehouse;
      if (patch.code && patch.code !== existing.code) {
        const dup = await db.warehouses.where('code').equalsIgnoreCase(patch.code).first();
        if (dup && dup.id !== id && !dup.deletedAt) {
          return err({ kind: 'conflict', message: `Ya existe un almacén con código "${patch.code}"` });
        }
      }
      if (patch.isDefault) {
        const all = await db.warehouses.toArray();
        for (const e of all) {
          if (e.id !== id && e.isDefault) {
            const demoted = { ...e, isDefault: false, updatedAt: now };
            await db.warehouses.put(demoted);
            await appendEvent(buildWarehouseEvent(demoted), tx);
          }
        }
      }
      await db.warehouses.put(next);
      await appendEvent(buildWarehouseEvent(next), tx);
      return ok(next);
    });
  } catch (cause) {
    return err({ kind: 'storage-failure', cause });
  }
}
