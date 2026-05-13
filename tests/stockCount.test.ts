import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/data/db';
import { createWarehouse } from '@/domain/use-cases/createWarehouse';
import { createProduct } from '@/domain/use-cases/createProduct';
import { createMovement } from '@/domain/use-cases/createMovement';
import {
  cancelStockCount,
  closeStockCount,
  incrementCount,
  removeCountedItem,
  setCountQuantity,
  startStockCount,
} from '@/domain/use-cases/stockCount';
import { stockLevelRepo } from '@/data/repositories';

async function resetDb() {
  await db.delete();
  await db.open();
}

async function setup() {
  const w = await createWarehouse({ code: 'A', name: 'A', isDefault: true, archived: false });
  if (!w.ok) throw new Error('warehouse');
  const a = await createProduct({ sku: 'A', name: 'Producto A', barcodes: ['111'], unit: 'unit', active: true });
  const b = await createProduct({ sku: 'B', name: 'Producto B', barcodes: ['222'], unit: 'unit', active: true });
  if (!a.ok || !b.ok) throw new Error('product');
  // Initial stock: A=10, B=5
  await createMovement({
    type: 'in',
    warehouseId: w.value.id,
    reason: 'purchase',
    lines: [
      { productId: a.value.id, quantity: 10 },
      { productId: b.value.id, quantity: 5 },
    ],
  });
  return { w: w.value, a: a.value, b: b.value };
}

describe('stockCount', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('snapshots current stock when started', async () => {
    const { w, a, b } = await setup();
    const res = await startStockCount({ warehouseId: w.id, scope: 'full' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const snap = res.value.expectedSnapshot;
    expect(snap.find((s) => s.productId === a.id)?.expected).toBe(10);
    expect(snap.find((s) => s.productId === b.id)?.expected).toBe(5);
  });

  it('increments a counted line', async () => {
    const { w, a } = await setup();
    const c = await startStockCount({ warehouseId: w.id, scope: 'full' });
    if (!c.ok) throw new Error();
    await incrementCount(c.value.id, a.id, 1);
    await incrementCount(c.value.id, a.id, 1);
    const stored = await db.stockCounts.get(c.value.id);
    expect(stored?.countedLines.find((l) => l.productId === a.id)?.counted).toBe(2);
  });

  it('setCountQuantity overrides the value', async () => {
    const { w, a } = await setup();
    const c = await startStockCount({ warehouseId: w.id, scope: 'full' });
    if (!c.ok) throw new Error();
    await incrementCount(c.value.id, a.id, 3);
    await setCountQuantity(c.value.id, a.id, 7);
    const stored = await db.stockCounts.get(c.value.id);
    expect(stored?.countedLines.find((l) => l.productId === a.id)?.counted).toBe(7);
  });

  it('removeCountedItem drops the line', async () => {
    const { w, a } = await setup();
    const c = await startStockCount({ warehouseId: w.id, scope: 'full' });
    if (!c.ok) throw new Error();
    await incrementCount(c.value.id, a.id, 4);
    await removeCountedItem(c.value.id, a.id);
    const stored = await db.stockCounts.get(c.value.id);
    expect(stored?.countedLines).toHaveLength(0);
  });

  it('closes generating in-movement for positive diff', async () => {
    const { w, a } = await setup(); // a has expected 10
    const c = await startStockCount({ warehouseId: w.id, scope: 'full' });
    if (!c.ok) throw new Error();
    await setCountQuantity(c.value.id, a.id, 12); // diff +2
    const res = await closeStockCount(c.value.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.positiveDiffs).toBe(1);
    expect(res.value.negativeDiffs).toBe(0);
    expect(res.value.count.status).toBe('closed');
    const lvl = await stockLevelRepo.get(w.id, a.id);
    expect(lvl?.quantity).toBe(12);
  });

  it('closes generating out-movement for negative diff', async () => {
    const { w, b } = await setup(); // b has expected 5
    const c = await startStockCount({ warehouseId: w.id, scope: 'full' });
    if (!c.ok) throw new Error();
    await setCountQuantity(c.value.id, b.id, 3); // diff -2
    const res = await closeStockCount(c.value.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.negativeDiffs).toBe(1);
    const lvl = await stockLevelRepo.get(w.id, b.id);
    expect(lvl?.quantity).toBe(3);
  });

  it('closes generating both movements with mixed diffs', async () => {
    const { w, a, b } = await setup(); // a=10, b=5
    const c = await startStockCount({ warehouseId: w.id, scope: 'full' });
    if (!c.ok) throw new Error();
    await setCountQuantity(c.value.id, a.id, 12); // +2
    await setCountQuantity(c.value.id, b.id, 4); // -1
    const res = await closeStockCount(c.value.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.movementIds).toHaveLength(2);
    expect(res.value.positiveDiffs).toBe(1);
    expect(res.value.negativeDiffs).toBe(1);
    const la = await stockLevelRepo.get(w.id, a.id);
    const lb = await stockLevelRepo.get(w.id, b.id);
    expect(la?.quantity).toBe(12);
    expect(lb?.quantity).toBe(4);
  });

  it('does not touch products that were not counted', async () => {
    const { w, a, b } = await setup();
    const c = await startStockCount({ warehouseId: w.id, scope: 'full' });
    if (!c.ok) throw new Error();
    await setCountQuantity(c.value.id, a.id, 10); // exact match, no diff
    // b never counted
    const res = await closeStockCount(c.value.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.movementIds).toHaveLength(0);
    const lb = await stockLevelRepo.get(w.id, b.id);
    expect(lb?.quantity).toBe(5); // unchanged
  });

  it('cancelStockCount leaves stock untouched', async () => {
    const { w, a } = await setup();
    const c = await startStockCount({ warehouseId: w.id, scope: 'full' });
    if (!c.ok) throw new Error();
    await setCountQuantity(c.value.id, a.id, 99);
    const res = await cancelStockCount(c.value.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe('cancelled');
    const lvl = await stockLevelRepo.get(w.id, a.id);
    expect(lvl?.quantity).toBe(10);
  });

  it('rejects modifying a closed count', async () => {
    const { w, a } = await setup();
    const c = await startStockCount({ warehouseId: w.id, scope: 'full' });
    if (!c.ok) throw new Error();
    await closeStockCount(c.value.id);
    const r = await incrementCount(c.value.id, a.id, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('conflict');
  });
});
