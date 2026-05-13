import { db } from '@/data/db';
import { newId } from '@/utils/ulid';
import { nowIso } from '@/utils/format';
import { err, ok, type Result } from '@/utils/result';
import { createMovement } from './createMovement';
import type { StockCount } from '../entities';

export interface StartStockCountInput {
  warehouseId: string;
  scope: 'full' | 'partial';
  filter?: { categoryIds?: string[]; productIds?: string[] };
  notes?: string;
}

/**
 * Snapshots the current stock for a warehouse into a new StockCount with
 * status "open". The user then records counted quantities for products as
 * they walk the shelves. Closing the count creates the adjustment
 * movement(s) needed to bring stock to the counted values.
 */
export async function startStockCount(
  input: StartStockCountInput,
): Promise<Result<StockCount>> {
  try {
    return await db.transaction(
      'rw',
      [db.stockCounts, db.stockLevels, db.warehouses, db.products],
      async () => {
        const w = await db.warehouses.get(input.warehouseId);
        if (!w || w.deletedAt) {
          return err({ kind: 'not-found', entity: 'warehouse', id: input.warehouseId });
        }

        // Build the expected snapshot.
        const levels = await db.stockLevels.where('warehouseId').equals(input.warehouseId).toArray();
        let filteredLevels = levels;
        if (input.scope === 'partial' && input.filter) {
          const { categoryIds, productIds } = input.filter;
          if (productIds && productIds.length > 0) {
            const set = new Set(productIds);
            filteredLevels = filteredLevels.filter((l) => set.has(l.productId));
          }
          if (categoryIds && categoryIds.length > 0) {
            const set = new Set(categoryIds);
            const inCategory = new Set<string>();
            await db.products
              .filter((p) => !p.deletedAt && !!p.categoryId && set.has(p.categoryId))
              .each((p) => inCategory.add(p.id));
            filteredLevels = filteredLevels.filter((l) => inCategory.has(l.productId));
          }
        }
        const expectedSnapshot = filteredLevels.map((l) => ({
          productId: l.productId,
          expected: l.quantity,
        }));

        const now = nowIso();
        const count: StockCount = {
          id: newId(),
          warehouseId: input.warehouseId,
          startedAt: now,
          status: 'open',
          scope: input.scope,
          filter: input.filter,
          expectedSnapshot,
          countedLines: [],
          notes: input.notes,
          createdAt: now,
          updatedAt: now,
        };
        await db.stockCounts.put(count);
        return ok(count);
      },
    );
  } catch (cause) {
    return err({ kind: 'storage-failure', cause });
  }
}

/**
 * Increments the counted quantity for a product (default +1). If no counted
 * line exists for the product yet, one is created.
 */
export async function incrementCount(
  countId: string,
  productId: string,
  delta = 1,
): Promise<Result<StockCount>> {
  return updateCountedLine(countId, productId, (current) => Math.max(0, (current ?? 0) + delta));
}

/**
 * Sets the counted quantity for a product to a specific value. Used by the
 * manual editor in the list view.
 */
export async function setCountQuantity(
  countId: string,
  productId: string,
  quantity: number,
): Promise<Result<StockCount>> {
  if (quantity < 0) {
    return err({ kind: 'validation', message: 'La cantidad no puede ser negativa.' });
  }
  return updateCountedLine(countId, productId, () => quantity);
}

/**
 * Removes a counted line entirely (so the product is treated as "not
 * counted" and no adjustment is generated for it at close).
 */
export async function removeCountedItem(
  countId: string,
  productId: string,
): Promise<Result<StockCount>> {
  try {
    return await db.transaction('rw', [db.stockCounts], async () => {
      const count = await db.stockCounts.get(countId);
      if (!count) return err({ kind: 'not-found', entity: 'stockCount', id: countId });
      if (count.status !== 'open') {
        return err({ kind: 'conflict', message: 'El recuento ya no está abierto.' });
      }
      const next: StockCount = {
        ...count,
        countedLines: count.countedLines.filter((l) => l.productId !== productId),
        updatedAt: nowIso(),
      };
      await db.stockCounts.put(next);
      return ok(next);
    });
  } catch (cause) {
    return err({ kind: 'storage-failure', cause });
  }
}

async function updateCountedLine(
  countId: string,
  productId: string,
  compute: (current: number | undefined) => number,
): Promise<Result<StockCount>> {
  try {
    return await db.transaction('rw', [db.stockCounts, db.products], async () => {
      const count = await db.stockCounts.get(countId);
      if (!count) return err({ kind: 'not-found', entity: 'stockCount', id: countId });
      if (count.status !== 'open') {
        return err({ kind: 'conflict', message: 'El recuento ya no está abierto.' });
      }
      const product = await db.products.get(productId);
      if (!product || product.deletedAt) {
        return err({ kind: 'not-found', entity: 'product', id: productId });
      }
      const existing = count.countedLines.find((l) => l.productId === productId);
      const next = compute(existing?.counted);
      const now = nowIso();
      const lines = existing
        ? count.countedLines.map((l) =>
            l.productId === productId ? { ...l, counted: next, countedAt: now } : l,
          )
        : [...count.countedLines, { productId, counted: next, countedAt: now }];
      const updated: StockCount = { ...count, countedLines: lines, updatedAt: now };
      await db.stockCounts.put(updated);
      return ok(updated);
    });
  } catch (cause) {
    return err({ kind: 'storage-failure', cause });
  }
}

export interface CloseStockCountResult {
  count: StockCount;
  movementIds: string[];
  positiveDiffs: number;
  negativeDiffs: number;
  unchanged: number;
}

/**
 * Closes the count, computing diffs between expected and counted quantities
 * for products that were counted. Generates up to two movements:
 *   - 'in' adjustment for products where counted > expected
 *   - 'out' adjustment for products where counted < expected
 * Products that were never counted are left untouched (no adjustment).
 */
export async function closeStockCount(countId: string): Promise<Result<CloseStockCountResult>> {
  try {
    const count = await db.stockCounts.get(countId);
    if (!count) return err({ kind: 'not-found', entity: 'stockCount', id: countId });
    if (count.status !== 'open') {
      return err({ kind: 'conflict', message: 'El recuento ya no está abierto.' });
    }

    const expectedMap = new Map(count.expectedSnapshot.map((s) => [s.productId, s.expected]));
    const positiveLines: { productId: string; quantity: number }[] = [];
    const negativeLines: { productId: string; quantity: number }[] = [];
    let unchanged = 0;

    for (const l of count.countedLines) {
      const expected = expectedMap.get(l.productId) ?? 0;
      const diff = l.counted - expected;
      if (diff > 0) positiveLines.push({ productId: l.productId, quantity: diff });
      else if (diff < 0) negativeLines.push({ productId: l.productId, quantity: -diff });
      else unchanged += 1;
    }

    const movementIds: string[] = [];
    const note = `Cierre de recuento ${count.id}`;

    if (positiveLines.length > 0) {
      const res = await createMovement({
        type: 'in',
        warehouseId: count.warehouseId,
        reason: 'count-adjust',
        notes: note,
        documentRef: count.id,
        lines: positiveLines,
      });
      if (!res.ok) return res;
      movementIds.push(res.value.movement.id);
    }

    if (negativeLines.length > 0) {
      const res = await createMovement(
        {
          type: 'out',
          warehouseId: count.warehouseId,
          reason: 'count-adjust',
          notes: note,
          documentRef: count.id,
          lines: negativeLines,
        },
        // A count is the ground truth; if intervening movements made
        // the current level lower than the counted decrement, we still
        // want the adjustment to apply.
        { allowNegativeStock: true },
      );
      if (!res.ok) return res;
      movementIds.push(res.value.movement.id);
    }

    const closed: StockCount = {
      ...count,
      status: 'closed',
      closedAt: nowIso(),
      adjustmentMovementIds: movementIds,
      updatedAt: nowIso(),
    };
    await db.stockCounts.put(closed);

    return ok({
      count: closed,
      movementIds,
      positiveDiffs: positiveLines.length,
      negativeDiffs: negativeLines.length,
      unchanged,
    });
  } catch (cause) {
    return err({ kind: 'storage-failure', cause });
  }
}

/**
 * Cancels an open count without generating any movement.
 */
export async function cancelStockCount(countId: string): Promise<Result<StockCount>> {
  try {
    return await db.transaction('rw', [db.stockCounts], async () => {
      const count = await db.stockCounts.get(countId);
      if (!count) return err({ kind: 'not-found', entity: 'stockCount', id: countId });
      if (count.status !== 'open') {
        return err({ kind: 'conflict', message: 'El recuento ya no está abierto.' });
      }
      const next: StockCount = {
        ...count,
        status: 'cancelled',
        closedAt: nowIso(),
        updatedAt: nowIso(),
      };
      await db.stockCounts.put(next);
      return ok(next);
    });
  } catch (cause) {
    return err({ kind: 'storage-failure', cause });
  }
}
