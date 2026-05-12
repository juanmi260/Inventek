import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/data/db';
import { createWarehouse } from '@/domain/use-cases/createWarehouse';
import { createProduct } from '@/domain/use-cases/createProduct';
import { createMovement } from '@/domain/use-cases/createMovement';
import { rebuildStockLevels } from '@/domain/use-cases/rebuildStockLevels';
import { stockLevelRepo } from '@/data/repositories';

async function resetDb() {
  await db.delete();
  await db.open();
}

async function setupWarehouseAndProduct() {
  const w = await createWarehouse({ code: 'A', name: 'Almacén A', isDefault: true, archived: false });
  if (!w.ok) throw new Error('warehouse');
  const p = await createProduct({ sku: 'P1', name: 'Prod 1', barcodes: ['111'], unit: 'unit', active: true });
  if (!p.ok) throw new Error('product');
  return { w: w.value, p: p.value };
}

describe('createMovement', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('adds stock on entry', async () => {
    const { w, p } = await setupWarehouseAndProduct();
    const res = await createMovement({
      type: 'in',
      warehouseId: w.id,
      reason: 'purchase',
      lines: [{ productId: p.id, quantity: 10 }],
    });
    expect(res.ok).toBe(true);
    const lvl = await stockLevelRepo.get(w.id, p.id);
    expect(lvl?.quantity).toBe(10);
  });

  it('subtracts stock on out', async () => {
    const { w, p } = await setupWarehouseAndProduct();
    await createMovement({
      type: 'in',
      warehouseId: w.id,
      reason: 'purchase',
      lines: [{ productId: p.id, quantity: 5 }],
    });
    const res = await createMovement({
      type: 'out',
      warehouseId: w.id,
      reason: 'sale',
      lines: [{ productId: p.id, quantity: 3 }],
    });
    expect(res.ok).toBe(true);
    const lvl = await stockLevelRepo.get(w.id, p.id);
    expect(lvl?.quantity).toBe(2);
  });

  it('rejects negative stock by default', async () => {
    const { w, p } = await setupWarehouseAndProduct();
    const res = await createMovement({
      type: 'out',
      warehouseId: w.id,
      reason: 'sale',
      lines: [{ productId: p.id, quantity: 3 }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('insufficient-stock');
  });

  it('transfers atomically', async () => {
    const wa = await createWarehouse({ code: 'A', name: 'A', isDefault: true, archived: false });
    const wb = await createWarehouse({ code: 'B', name: 'B', isDefault: false, archived: false });
    if (!wa.ok || !wb.ok) throw new Error();
    const p = await createProduct({ sku: 'X', name: 'X', barcodes: [], unit: 'unit', active: true });
    if (!p.ok) throw new Error();
    await createMovement({
      type: 'in',
      warehouseId: wa.value.id,
      reason: 'purchase',
      lines: [{ productId: p.value.id, quantity: 8 }],
    });
    const res = await createMovement({
      type: 'transfer',
      warehouseId: wa.value.id,
      destinationWarehouseId: wb.value.id,
      reason: 'transfer',
      lines: [{ productId: p.value.id, quantity: 3 }],
    });
    expect(res.ok).toBe(true);
    const a = await stockLevelRepo.get(wa.value.id, p.value.id);
    const b = await stockLevelRepo.get(wb.value.id, p.value.id);
    expect(a?.quantity).toBe(5);
    expect(b?.quantity).toBe(3);
  });

  it('rejects transfer when source has insufficient stock (atomic)', async () => {
    const wa = await createWarehouse({ code: 'A', name: 'A', isDefault: true, archived: false });
    const wb = await createWarehouse({ code: 'B', name: 'B', isDefault: false, archived: false });
    if (!wa.ok || !wb.ok) throw new Error();
    const p = await createProduct({ sku: 'X', name: 'X', barcodes: [], unit: 'unit', active: true });
    if (!p.ok) throw new Error();
    await createMovement({
      type: 'in',
      warehouseId: wa.value.id,
      reason: 'purchase',
      lines: [{ productId: p.value.id, quantity: 2 }],
    });
    const res = await createMovement({
      type: 'transfer',
      warehouseId: wa.value.id,
      destinationWarehouseId: wb.value.id,
      reason: 'transfer',
      lines: [{ productId: p.value.id, quantity: 5 }],
    });
    expect(res.ok).toBe(false);
    // Both warehouses should remain unchanged.
    const a = await stockLevelRepo.get(wa.value.id, p.value.id);
    const b = await stockLevelRepo.get(wb.value.id, p.value.id);
    expect(a?.quantity).toBe(2);
    expect(b).toBeUndefined();
  });
});

describe('rebuildStockLevels', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('recomputes levels from movements', async () => {
    const { w, p } = await setupWarehouseAndProduct();
    await createMovement({
      type: 'in',
      warehouseId: w.id,
      reason: 'purchase',
      lines: [{ productId: p.id, quantity: 10 }],
    });
    await createMovement({
      type: 'out',
      warehouseId: w.id,
      reason: 'sale',
      lines: [{ productId: p.id, quantity: 4 }],
    });
    // Tamper with stockLevels
    const existing = await stockLevelRepo.get(w.id, p.id);
    if (existing) await stockLevelRepo.upsert({ ...existing, quantity: 999 });

    const r = await rebuildStockLevels();
    expect(r.touched).toBeGreaterThan(0);
    const after = await stockLevelRepo.get(w.id, p.id);
    expect(after?.quantity).toBe(6);
  });
});
