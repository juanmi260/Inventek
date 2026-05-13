import { db } from '@/data/db';
import { newId } from '@/utils/ulid';
import { nowIso } from '@/utils/format';
import { err, ok, type Result } from '@/utils/result';
import type { StockLevel } from '../entities';

export interface SetStockLimitsInput {
  warehouseId: string;
  productId: string;
  minStock?: number | null;
  maxStock?: number | null;
  location?: string | null;
}

/**
 * Sets (or clears) min/max stock and location for a (warehouse, product).
 * Creates the StockLevel row if it doesn't exist yet — with quantity 0.
 */
export async function setStockLimits(input: SetStockLimitsInput): Promise<Result<StockLevel>> {
  const { warehouseId, productId } = input;
  if (input.minStock != null && input.maxStock != null && input.minStock > input.maxStock) {
    return err({
      kind: 'validation',
      message: 'El mínimo no puede ser mayor que el máximo.',
    });
  }
  try {
    return await db.transaction('rw', [db.stockLevels], async () => {
      const existing = await db.stockLevels
        .where('[warehouseId+productId]')
        .equals([warehouseId, productId])
        .first();
      const now = nowIso();
      const next: StockLevel = existing
        ? {
            ...existing,
            minStock: input.minStock ?? undefined,
            maxStock: input.maxStock ?? undefined,
            location: input.location ?? undefined,
            updatedAt: now,
          }
        : {
            id: newId(),
            warehouseId,
            productId,
            quantity: 0,
            minStock: input.minStock ?? undefined,
            maxStock: input.maxStock ?? undefined,
            location: input.location ?? undefined,
            updatedAt: now,
          };
      await db.stockLevels.put(next);
      return ok(next);
    });
  } catch (cause) {
    return err({ kind: 'storage-failure', cause });
  }
}
