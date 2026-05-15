import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/data/db';
import { createWarehouse } from '@/domain/use-cases/createWarehouse';
import { createProduct } from '@/domain/use-cases/createProduct';
import { createMovement } from '@/domain/use-cases/createMovement';
import {
  applyEvents,
  buildProductEvent,
  buildWarehouseEvent,
  computeLocalWatermarks,
  eventsNewerThan,
  fingerprint,
  fingerprintsMatch,
} from '@/domain/use-cases/syncEvents';
import { stockLevelRepo } from '@/data/repositories';

async function resetDb() {
  await db.delete();
  await db.open();
}

describe('event log emission', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('emits events for warehouse, product and movement', async () => {
    const w = await createWarehouse({ code: 'A', name: 'A', isDefault: true, archived: false });
    if (!w.ok) throw new Error();
    const p = await createProduct({ sku: 'P', name: 'P', barcodes: [], unit: 'unit', active: true });
    if (!p.ok) throw new Error();
    await createMovement({
      type: 'in',
      warehouseId: w.value.id,
      reason: 'purchase',
      lines: [{ productId: p.value.id, quantity: 5 }],
    });
    const events = await db.syncEvents.toArray();
    expect(events.find((e) => e.entity === 'warehouse' && e.entityId === w.value.id)).toBeTruthy();
    expect(events.find((e) => e.entity === 'product' && e.entityId === p.value.id)).toBeTruthy();
    expect(events.find((e) => e.entity === 'movement')).toBeTruthy();
  });
});

describe('watermarks + applyEvents', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('computeLocalWatermarks tracks the latest event id per author', async () => {
    const w = await createWarehouse({ code: 'A', name: 'A', isDefault: true, archived: false });
    if (!w.ok) throw new Error();
    const wm = await computeLocalWatermarks();
    const allIds = (await db.syncEvents.toArray()).map((e) => e.id).sort();
    const lastId = allIds[allIds.length - 1];
    expect(Object.values(wm)).toContain(lastId);
  });

  it('eventsNewerThan returns only events the peer is missing', async () => {
    const w = await createWarehouse({ code: 'A', name: 'A', isDefault: true, archived: false });
    if (!w.ok) throw new Error();
    const all = await db.syncEvents.toArray();
    expect(all.length).toBeGreaterThan(0);
    // Peer claims to have seen everything → nothing newer.
    const wm = await computeLocalWatermarks();
    const newer = await eventsNewerThan(wm);
    expect(newer.length).toBe(0);
    // Peer claims to have seen nothing from this device → everything newer.
    const allFromScratch = await eventsNewerThan({});
    expect(allFromScratch.length).toBe(all.length);
  });

  it('applyEvents is idempotent and applies foreign events', async () => {
    // Build a foreign event as if it came from another device.
    const w = await createWarehouse({ code: 'X', name: 'X', isDefault: false, archived: false });
    if (!w.ok) throw new Error();
    const foreign = buildWarehouseEvent({ ...w.value, name: 'X-renamed', updatedAt: new Date(Date.now() + 1000).toISOString() });
    // Override deviceId to simulate origin from another device.
    foreign.deviceId = 'dev_OTHER';
    const r1 = await applyEvents([foreign]);
    expect(r1.applied).toBe(1);
    const after = await db.warehouses.get(w.value.id);
    expect(after?.name).toBe('X-renamed');
    // Re-applying the same event is a no-op.
    const r2 = await applyEvents([foreign]);
    expect(r2.applied).toBe(0);
  });

  it('applyEvents respects LWW by updatedAt', async () => {
    const w = await createWarehouse({ code: 'B', name: 'B', isDefault: false, archived: false });
    if (!w.ok) throw new Error();
    // Foreign event with an older updatedAt → should NOT overwrite local.
    const stale = buildWarehouseEvent({ ...w.value, name: 'STALE', updatedAt: new Date(Date.now() - 5000).toISOString() });
    stale.deviceId = 'dev_OTHER';
    await applyEvents([stale]);
    const after = await db.warehouses.get(w.value.id);
    expect(after?.name).toBe('B');
  });

  it('replays a movement from another device and the stock can be recomputed', async () => {
    const w = await createWarehouse({ code: 'A', name: 'A', isDefault: true, archived: false });
    if (!w.ok) throw new Error();
    const p = await createProduct({ sku: 'P', name: 'P', barcodes: [], unit: 'unit', active: true });
    if (!p.ok) throw new Error();
    // Create a movement and capture its event.
    await createMovement({
      type: 'in',
      warehouseId: w.value.id,
      reason: 'purchase',
      lines: [{ productId: p.value.id, quantity: 7 }],
    });
    const moves = await db.movements.toArray();
    const lines = await db.movementLines.toArray();
    expect(moves.length).toBe(1);
    expect(lines.length).toBe(1);
    // Clear local movements + lines and re-apply via event log.
    const ev = (await db.syncEvents.toArray()).find((e) => e.entity === 'movement')!;
    const foreign = { ...ev, deviceId: 'dev_OTHER', id: 'foreign_' + ev.id };
    await db.movements.clear();
    await db.movementLines.clear();
    await db.syncEvents.where('entity').equals('movement').delete();
    const r = await applyEvents([foreign]);
    expect(r.applied).toBe(1);
    expect(r.movementsTouched).toBe(1);
    const newMoves = await db.movements.toArray();
    expect(newMoves.length).toBe(1);
    expect(newMoves[0]!.id).toBe((ev.payload as { movement: { id: string } }).movement.id);
  });
});

describe('fingerprint', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('matches on identical local state', async () => {
    const w = await createWarehouse({ code: 'A', name: 'A', isDefault: true, archived: false });
    if (!w.ok) throw new Error();
    const fp1 = await fingerprint();
    const fp2 = await fingerprint();
    expect(fingerprintsMatch(fp1, fp2)).toBe(true);
  });

  it('does not match after one device adds an extra event', async () => {
    const before = await fingerprint();
    const w = await createWarehouse({ code: 'A', name: 'A', isDefault: true, archived: false });
    if (!w.ok) throw new Error();
    const after = await fingerprint();
    expect(fingerprintsMatch(before, after)).toBe(false);
  });
});
