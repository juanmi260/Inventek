import type { Transaction } from 'dexie';
import { db } from '@/data/db';
import { newId } from '@/utils/ulid';
import { nowIso } from '@/utils/format';
import { getDeviceId } from '@/platform/device';
import type {
  Movement,
  MovementLine,
  Product,
  StockCount,
  StockLevel,
  SyncEvent,
  Warehouse,
} from '../entities';

/**
 * The list of entities whose changes are propagated through the event log.
 * Note that stockLevel.quantity is *not* synced — it's derived from
 * movements and recomputed locally after applying any batch of events.
 */
export type SyncEntity =
  | 'product'
  | 'warehouse'
  | 'movement'
  | 'stockLevelLimits'
  | 'stockCount'
  | 'setting';

interface MovementPayload {
  movement: Movement;
  lines: MovementLine[];
}

interface ProductPayload extends Omit<Product, 'imageBlob'> {
  imageBlobB64?: string;
}

interface SettingPayload {
  key: string;
  value: unknown;
  updatedAt: string;
}

// ─── Build / emit ─────────────────────────────────────────────────────────

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

function base64ToBlob(b64: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr]);
}

async function serializeProduct(p: Product): Promise<ProductPayload> {
  const { imageBlob, ...rest } = p;
  return {
    ...rest,
    imageBlobB64: imageBlob ? await blobToBase64(imageBlob) : undefined,
  };
}

function deserializeProduct(payload: ProductPayload): Product {
  const { imageBlobB64, ...rest } = payload;
  return {
    ...rest,
    imageBlob: imageBlobB64 ? base64ToBlob(imageBlobB64) : undefined,
  } as Product;
}

export async function buildProductEvent(p: Product): Promise<SyncEvent> {
  return {
    id: newId(),
    deviceId: getDeviceId(),
    entity: 'product',
    entityId: p.id,
    op: 'upsert',
    payload: await serializeProduct(p),
    occurredAt: nowIso(),
  };
}

export function buildWarehouseEvent(w: Warehouse): SyncEvent {
  return {
    id: newId(),
    deviceId: getDeviceId(),
    entity: 'warehouse',
    entityId: w.id,
    op: 'upsert',
    payload: w,
    occurredAt: nowIso(),
  };
}

export function buildMovementEvent(m: Movement, lines: MovementLine[]): SyncEvent {
  const payload: MovementPayload = { movement: m, lines };
  return {
    id: newId(),
    deviceId: getDeviceId(),
    entity: 'movement',
    entityId: m.id,
    op: 'upsert',
    payload,
    occurredAt: nowIso(),
  };
}

export function buildStockLevelLimitsEvent(l: StockLevel): SyncEvent {
  // Only the policy fields travel — not quantity.
  return {
    id: newId(),
    deviceId: getDeviceId(),
    entity: 'stockLevelLimits',
    entityId: `${l.warehouseId}:${l.productId}`,
    op: 'upsert',
    payload: {
      warehouseId: l.warehouseId,
      productId: l.productId,
      minStock: l.minStock,
      maxStock: l.maxStock,
      location: l.location,
      updatedAt: l.updatedAt,
    },
    occurredAt: nowIso(),
  };
}

export function buildStockCountEvent(c: StockCount): SyncEvent {
  return {
    id: newId(),
    deviceId: getDeviceId(),
    entity: 'stockCount',
    entityId: c.id,
    op: 'upsert',
    payload: c,
    occurredAt: nowIso(),
  };
}

export function buildSettingEvent(key: string, value: unknown): SyncEvent {
  const payload: SettingPayload = { key, value, updatedAt: nowIso() };
  return {
    id: newId(),
    deviceId: getDeviceId(),
    entity: 'setting',
    entityId: key,
    op: 'upsert',
    payload,
    occurredAt: nowIso(),
  };
}

/**
 * Writes a SyncEvent inside the current transaction (or starts one for the
 * syncEvents table alone if none is provided).
 */
export async function appendEvent(event: SyncEvent, tx?: Transaction): Promise<void> {
  if (tx) {
    await tx.table('syncEvents').put(event);
  } else {
    await db.syncEvents.put(event);
  }
}

// ─── Apply incoming events ────────────────────────────────────────────────

export interface ApplyResult {
  applied: number;
  movementsTouched: number;
  byEntity: Record<string, number>;
  errors: string[];
}

/**
 * Applies a batch of remote events to the local DB. Idempotent: events with
 * an id we already have are skipped. After applying, callers should call
 * rebuildStockLevels() if movementsTouched > 0.
 */
export async function applyEvents(events: SyncEvent[]): Promise<ApplyResult> {
  const result: ApplyResult = { applied: 0, movementsTouched: 0, byEntity: {}, errors: [] };
  if (events.length === 0) return result;

  // Determine which events are new.
  const ids = events.map((e) => e.id);
  const existing = new Set(await db.syncEvents.where('id').anyOf(ids).primaryKeys());
  const fresh = events.filter((e) => !existing.has(e.id));
  if (fresh.length === 0) return result;

  await db.transaction(
    'rw',
    [
      db.syncEvents,
      db.products,
      db.warehouses,
      db.movements,
      db.movementLines,
      db.stockLevels,
      db.stockCounts,
      db.settings,
    ],
    async () => {
      for (const ev of fresh) {
        try {
          await applyOne(ev);
          await db.syncEvents.put(ev);
          result.applied += 1;
          result.byEntity[ev.entity] = (result.byEntity[ev.entity] ?? 0) + 1;
          if (ev.entity === 'movement') result.movementsTouched += 1;
        } catch (err) {
          result.errors.push(`${ev.entity}/${ev.entityId}: ${(err as Error).message}`);
        }
      }
    },
  );

  return result;
}

async function applyOne(event: SyncEvent): Promise<void> {
  switch (event.entity) {
    case 'product': {
      const incoming = deserializeProduct(event.payload as ProductPayload);
      const local = await db.products.get(incoming.id);
      if (local && local.updatedAt && local.updatedAt > incoming.updatedAt) return;
      await db.products.put(incoming);
      return;
    }
    case 'warehouse': {
      const incoming = event.payload as Warehouse;
      const local = await db.warehouses.get(incoming.id);
      if (local && local.updatedAt && local.updatedAt > incoming.updatedAt) return;
      await db.warehouses.put(incoming);
      return;
    }
    case 'movement': {
      const { movement, lines } = event.payload as MovementPayload;
      // Movements are immutable, so we never overwrite an existing one.
      const exists = await db.movements.get(movement.id);
      if (exists) return;
      await db.movements.put(movement);
      for (const ln of lines) await db.movementLines.put(ln);
      return;
    }
    case 'stockLevelLimits': {
      const p = event.payload as {
        warehouseId: string;
        productId: string;
        minStock?: number;
        maxStock?: number;
        location?: string;
        updatedAt: string;
      };
      const existing = await db.stockLevels
        .where('[warehouseId+productId]')
        .equals([p.warehouseId, p.productId])
        .first();
      if (existing && existing.updatedAt && existing.updatedAt > p.updatedAt) return;
      const next: StockLevel = existing
        ? { ...existing, minStock: p.minStock, maxStock: p.maxStock, location: p.location, updatedAt: p.updatedAt }
        : {
            id: newId(),
            warehouseId: p.warehouseId,
            productId: p.productId,
            quantity: 0,
            minStock: p.minStock,
            maxStock: p.maxStock,
            location: p.location,
            updatedAt: p.updatedAt,
          };
      await db.stockLevels.put(next);
      return;
    }
    case 'stockCount': {
      const incoming = event.payload as StockCount;
      const local = await db.stockCounts.get(incoming.id);
      if (local && local.updatedAt && local.updatedAt > incoming.updatedAt) return;
      await db.stockCounts.put(incoming);
      return;
    }
    case 'setting': {
      const p = event.payload as SettingPayload;
      const local = await db.settings.get(p.key);
      if (local && local.updatedAt && local.updatedAt > p.updatedAt) return;
      await db.settings.put({ key: p.key, value: p.value, updatedAt: p.updatedAt });
      return;
    }
  }
}

// ─── Watermarks ───────────────────────────────────────────────────────────

const WATERMARKS_KEY = 'sync.watermarks';

export type Watermarks = Record<string, string>; // deviceId → lastEventId

export async function getWatermarks(): Promise<Watermarks> {
  const row = await db.settings.get(WATERMARKS_KEY);
  return (row?.value as Watermarks) ?? {};
}

export async function setWatermarks(w: Watermarks): Promise<void> {
  await db.settings.put({ key: WATERMARKS_KEY, value: w, updatedAt: nowIso() });
}

/**
 * Updates the local watermarks to reflect that we've seen all events up to
 * (and including) the given ids. Only moves forward, never backwards.
 */
export async function advanceWatermarks(seen: Watermarks): Promise<Watermarks> {
  const current = await getWatermarks();
  const next: Watermarks = { ...current };
  for (const [deviceId, lastId] of Object.entries(seen)) {
    const have = next[deviceId];
    if (!have || lastId > have) next[deviceId] = lastId;
  }
  await setWatermarks(next);
  return next;
}

/**
 * Computes the latest event id we have *locally* for each known deviceId.
 * Used to publish "I've seen up to X" to peers.
 */
export async function computeLocalWatermarks(): Promise<Watermarks> {
  const grouped: Watermarks = {};
  await db.syncEvents.each((ev) => {
    const cur = grouped[ev.deviceId];
    if (!cur || ev.id > cur) grouped[ev.deviceId] = ev.id;
  });
  return grouped;
}

/**
 * Selects local events newer than what the peer claims to have. Peer's
 * watermarks map deviceId → lastSeenEventId; for every (deviceId, id)
 * pair in our log where id > peer[deviceId], the event is sent.
 */
export async function eventsNewerThan(
  peerWatermarks: Watermarks,
): Promise<SyncEvent[]> {
  const all = await db.syncEvents.orderBy('id').toArray();
  return all.filter((ev) => {
    const peerSeen = peerWatermarks[ev.deviceId];
    if (!peerSeen) return true; // peer doesn't know this device → send everything
    return ev.id > peerSeen;
  });
}

// ─── Fingerprint (for primary promotion check) ────────────────────────────

/**
 * Stable summary of the local state used to decide whether two devices are
 * "in sync enough" for one to be promoted to primary without data loss.
 *
 * Compares total count of events per author and the last event id of each.
 * If those match exactly, the two devices have applied the same history.
 */
export interface Fingerprint {
  watermarks: Watermarks;
  eventCount: number;
}

export async function fingerprint(): Promise<Fingerprint> {
  const watermarks = await computeLocalWatermarks();
  const eventCount = await db.syncEvents.count();
  return { watermarks, eventCount };
}

export function fingerprintsMatch(a: Fingerprint, b: Fingerprint): boolean {
  if (a.eventCount !== b.eventCount) return false;
  const keysA = Object.keys(a.watermarks).sort();
  const keysB = Object.keys(b.watermarks).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return false;
    if (a.watermarks[keysA[i]!] !== b.watermarks[keysB[i]!]) return false;
  }
  return true;
}
