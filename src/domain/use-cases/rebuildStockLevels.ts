import { db } from '@/data/db';
import { newId } from '@/utils/ulid';
import { nowIso } from '@/utils/format';
import type { StockLevel } from '../entities';

/**
 * Recomputes all stockLevels by replaying every confirmed movement.
 * Use it as a recovery operation after import or when inconsistencies are suspected.
 */
export async function rebuildStockLevels(): Promise<{ touched: number }> {
  return db.transaction(
    'rw',
    db.movements,
    db.movementLines,
    db.stockLevels,
    async () => {
      await db.stockLevels.clear();

      const movements = await db.movements.orderBy('occurredAt').toArray();
      const totals = new Map<string, number>(); // key: warehouseId:productId
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

      const now = nowIso();
      const levels: StockLevel[] = [];
      for (const [key, qty] of totals) {
        const [warehouseId, productId] = key.split(':') as [string, string];
        levels.push({
          id: newId(),
          warehouseId,
          productId,
          quantity: qty,
          lastMovementAt: lastMov.get(key),
          updatedAt: now,
        });
      }
      await db.stockLevels.bulkPut(levels);
      return { touched: levels.length };
    },
  );
}
