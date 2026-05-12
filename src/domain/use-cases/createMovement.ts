import { db } from '@/data/db';
import { newId } from '@/utils/ulid';
import { nowIso } from '@/utils/format';
import { err, ok, type Result } from '@/utils/result';
import { movementInputSchema, type MovementInput } from '../schemas';
import type { Movement, MovementLine, StockLevel } from '../entities';

export interface CreateMovementResult {
  movement: Movement;
  lines: MovementLine[];
}

/**
 * Creates a confirmed movement and atomically updates stock_levels.
 *
 * Rules:
 *  - 'in'       : adds to warehouseId
 *  - 'out'      : subtracts from warehouseId (errors if not enough stock unless allowNegative)
 *  - 'transfer' : subtracts from warehouseId, adds to destinationWarehouseId
 *  - 'adjust'   : sets warehouseId quantity to a delta (positive or negative; clamp at 0 unless allowNegative)
 */
export async function createMovement(
  input: MovementInput,
  opts: { allowNegativeStock?: boolean } = {},
): Promise<Result<CreateMovementResult>> {
  const parsed = movementInputSchema.safeParse(input);
  if (!parsed.success) {
    return err({ kind: 'validation', message: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const data = parsed.data;
  const allowNegative = opts.allowNegativeStock ?? false;
  const now = nowIso();
  const occurredAt = data.occurredAt ?? now;

  try {
    return await db.transaction(
      'rw',
      [db.movements, db.movementLines, db.stockLevels, db.products, db.warehouses],
      async () => {
        // Validate referenced entities exist
        if (data.warehouseId) {
          const w = await db.warehouses.get(data.warehouseId);
          if (!w || w.deletedAt) return err({ kind: 'not-found', entity: 'warehouse', id: data.warehouseId });
        }
        if (data.destinationWarehouseId) {
          const w = await db.warehouses.get(data.destinationWarehouseId);
          if (!w || w.deletedAt)
            return err({ kind: 'not-found', entity: 'warehouse', id: data.destinationWarehouseId });
        }
        for (const l of data.lines) {
          const p = await db.products.get(l.productId);
          if (!p || p.deletedAt) return err({ kind: 'not-found', entity: 'product', id: l.productId });
        }

        // Compute deltas per (warehouse, product)
        type Key = `${string}:${string}`;
        const deltas = new Map<Key, number>();
        const add = (warehouseId: string, productId: string, qty: number) => {
          const k: Key = `${warehouseId}:${productId}`;
          deltas.set(k, (deltas.get(k) ?? 0) + qty);
        };

        for (const l of data.lines) {
          if (data.type === 'in') add(data.warehouseId!, l.productId, +l.quantity);
          else if (data.type === 'out') add(data.warehouseId!, l.productId, -l.quantity);
          else if (data.type === 'adjust') add(data.warehouseId!, l.productId, +l.quantity);
          else if (data.type === 'transfer') {
            add(data.warehouseId!, l.productId, -l.quantity);
            add(data.destinationWarehouseId!, l.productId, +l.quantity);
          }
        }

        // Apply with stock check
        for (const [key, delta] of deltas) {
          const [warehouseId, productId] = key.split(':') as [string, string];
          const current = await db.stockLevels
            .where('[warehouseId+productId]')
            .equals([warehouseId, productId])
            .first();
          const prev = current?.quantity ?? 0;
          const next = prev + delta;
          if (next < 0 && !allowNegative) {
            return err({
              kind: 'insufficient-stock',
              warehouseId,
              productId,
              available: prev,
              requested: -delta,
            });
          }
          const level: StockLevel = current
            ? { ...current, quantity: next, lastMovementAt: occurredAt, updatedAt: now }
            : {
                id: newId(),
                warehouseId,
                productId,
                quantity: next,
                lastMovementAt: occurredAt,
                updatedAt: now,
              };
          await db.stockLevels.put(level);
        }

        // Persist movement + lines
        const movement: Movement = {
          id: newId(),
          type: data.type,
          occurredAt,
          warehouseId: data.warehouseId,
          destinationWarehouseId: data.destinationWarehouseId,
          reason: data.reason,
          notes: data.notes,
          userId: data.userId,
          documentRef: data.documentRef,
          status: 'confirmed',
          createdAt: now,
          updatedAt: now,
        };
        await db.movements.put(movement);

        const lines: MovementLine[] = data.lines.map((l) => ({
          id: newId(),
          movementId: movement.id,
          productId: l.productId,
          quantity: l.quantity,
          unitCost: l.unitCost,
          notes: l.notes,
        }));
        for (const l of lines) await db.movementLines.put(l);

        return ok({ movement, lines });
      },
    );
  } catch (cause) {
    return err({ kind: 'storage-failure', cause });
  }
}
