import { db } from '@/data/db';
import { newId } from '@/utils/ulid';
import { nowIso } from '@/utils/format';
import type { StockLevel } from '../entities';

/**
 * Recomputes all stockLevels by replaying every confirmed movement.
 *
 * Preserves the policy fields (min/max/location/id) per (warehouseId, productId)
 * if a row already exists — those are user-set / synced via `stockLevelLimits`
 * events and must NOT be lost when the quantity is recomputed.
 */
export async function rebuildStockLevels(): Promise<{ touched: number }> {
  return db.transaction(
    'rw',
    db.movements,
    db.movementLines,
    db.stockLevels,
    async () => {
      // 1. Snapshot existing rows so we can preserve their policy fields.
      const existing = await db.stockLevels.toArray();
      const byKey = new Map<string, StockLevel>();
      for (const lvl of existing) {
        byKey.set(`${lvl.warehouseId}:${lvl.productId}`, lvl);
      }

      // 2. Aggregate quantities from confirmed movements.
      const movements = await db.movements.orderBy('occurredAt').toArray();
      const totals = new Map<string, number>();
      const lastMov = new Map<string, string>();

      for (const m of movements) {
        if (m.status !== 'confirmed') continue;
        const lines = await db.movementLines.where('movementId').equals(m.id).toArray();
        for (const l of lines) {
          const apply = (wh: string, sign: 1 | -1) => {
            const k = `${wh}:${l.productId}`;
            totals.set(k, (totals.get(k) ?? 0) + sign * l.quantity);
            lastMov.set(k, m.occurredAt);
          };
          if (m.type === 'in' && m.warehouseId) apply(m.warehouseId, 1);
          else if (m.type === 'out' && m.warehouseId) apply(m.warehouseId, -1);
          else if (m.type === 'adjust' && m.warehouseId) apply(m.warehouseId, 1);
          else if (m.type === 'transfer' && m.warehouseId && m.destinationWarehouseId) {
            apply(m.warehouseId, -1);
            apply(m.destinationWarehouseId, 1);
          }
        }
      }

      // 3. Build the union of keys (existing limits + computed quantities).
      const keys = new Set<string>([...byKey.keys(), ...totals.keys()]);
      const now = nowIso();
      const levels: StockLevel[] = [];
      for (const key of keys) {
        const [warehouseId, productId] = key.split(':') as [string, string];
        const prev = byKey.get(key);
        const qty = totals.get(key) ?? 0;
        levels.push({
          id: prev?.id ?? newId(),
          warehouseId,
          productId,
          quantity: qty,
          lastMovementAt: lastMov.get(key) ?? prev?.lastMovementAt,
          minStock: prev?.minStock,
          maxStock: prev?.maxStock,
          location: prev?.location,
          updatedAt: now,
        });
      }

      // 4. Replace the table contents in one batch. clear() + bulkPut() is fast
      // in Dexie and atomic within the transaction.
      await db.stockLevels.clear();
      await db.stockLevels.bulkPut(levels);
      return { touched: levels.length };
    },
  );
}
