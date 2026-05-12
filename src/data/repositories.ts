import { db } from './db';
import type {
  Category,
  Movement,
  MovementLine,
  Product,
  Setting,
  StockCount,
  StockLevel,
  Supplier,
  SyncEvent,
  User,
} from '@/domain/entities';
import type {
  CategoryRepo,
  MovementRepo,
  ProductRepo,
  SettingsRepo,
  StockCountRepo,
  StockLevelRepo,
  SupplierRepo,
  SyncEventRepo,
  UserRepo,
  WarehouseRepo,
} from '@/domain/ports';

export const warehouseRepo: WarehouseRepo = {
  async getAll() {
    return db.warehouses.filter((w) => !w.deletedAt).toArray();
  },
  async get(id) {
    return db.warehouses.get(id);
  },
  async upsert(w) {
    await db.warehouses.put(w);
  },
  async remove(id) {
    const w = await db.warehouses.get(id);
    if (!w) return;
    await db.warehouses.put({ ...w, deletedAt: new Date().toISOString() });
  },
};

export const productRepo: ProductRepo = {
  async getAll() {
    return db.products.filter((p) => !p.deletedAt).toArray();
  },
  async get(id) {
    return db.products.get(id);
  },
  async findBySku(sku) {
    return db.products.where('sku').equals(sku).first();
  },
  async findByBarcode(code) {
    const found = await db.products.where('barcodes').equals(code).first();
    return found && !found.deletedAt ? found : undefined;
  },
  async search(q, limit = 50) {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    // First try exact SKU/barcode
    const bySku = await db.products.where('sku').equalsIgnoreCase(q).first();
    if (bySku && !bySku.deletedAt) return [bySku];
    const byBarcode = await db.products.where('barcodes').equals(q).first();
    if (byBarcode && !byBarcode.deletedAt) return [byBarcode];

    const results: Product[] = [];
    await db.products
      .filter(
        (p) =>
          !p.deletedAt &&
          (p.name.toLowerCase().includes(needle) ||
            p.sku.toLowerCase().includes(needle) ||
            (p.description?.toLowerCase().includes(needle) ?? false)),
      )
      .each((p) => {
        if (results.length < limit) results.push(p);
      });
    return results;
  },
  async upsert(p) {
    await db.products.put(p);
  },
  async remove(id) {
    const p = await db.products.get(id);
    if (!p) return;
    await db.products.put({ ...p, deletedAt: new Date().toISOString() });
  },
};

export const categoryRepo: CategoryRepo = {
  async getAll() {
    return db.categories.filter((c) => !c.deletedAt).toArray();
  },
  async upsert(c: Category) {
    await db.categories.put(c);
  },
  async remove(id) {
    const c = await db.categories.get(id);
    if (!c) return;
    await db.categories.put({ ...c, deletedAt: new Date().toISOString() });
  },
};

export const supplierRepo: SupplierRepo = {
  async getAll() {
    return db.suppliers.filter((s) => !s.deletedAt).toArray();
  },
  async upsert(s: Supplier) {
    await db.suppliers.put(s);
  },
  async remove(id) {
    const s = await db.suppliers.get(id);
    if (!s) return;
    await db.suppliers.put({ ...s, deletedAt: new Date().toISOString() });
  },
};

export const stockLevelRepo: StockLevelRepo = {
  async byWarehouse(warehouseId) {
    return db.stockLevels.where('warehouseId').equals(warehouseId).toArray();
  },
  async byProduct(productId) {
    return db.stockLevels.where('productId').equals(productId).toArray();
  },
  async get(warehouseId, productId) {
    return db.stockLevels
      .where('[warehouseId+productId]')
      .equals([warehouseId, productId])
      .first();
  },
  async upsert(l: StockLevel) {
    await db.stockLevels.put(l);
  },
};

export const movementRepo: MovementRepo = {
  async list(opts = {}) {
    let coll = db.movements.orderBy('occurredAt').reverse();
    if (opts.type) coll = coll.filter((m) => m.type === opts.type);
    if (opts.warehouseId)
      coll = coll.filter(
        (m) => m.warehouseId === opts.warehouseId || m.destinationWarehouseId === opts.warehouseId,
      );
    if (opts.from) coll = coll.filter((m) => m.occurredAt >= opts.from!);
    if (opts.to) coll = coll.filter((m) => m.occurredAt <= opts.to!);
    if (opts.limit) coll = coll.limit(opts.limit);
    return coll.toArray();
  },
  async get(id) {
    return db.movements.get(id);
  },
  async upsert(m: Movement) {
    await db.movements.put(m);
  },
  async linesByMovement(movementId) {
    return db.movementLines.where('movementId').equals(movementId).toArray();
  },
  async upsertLine(l: MovementLine) {
    await db.movementLines.put(l);
  },
};

export const stockCountRepo: StockCountRepo = {
  async list() {
    return db.stockCounts.orderBy('startedAt').reverse().toArray();
  },
  async get(id) {
    return db.stockCounts.get(id);
  },
  async upsert(c: StockCount) {
    await db.stockCounts.put(c);
  },
};

export const userRepo: UserRepo = {
  async getAll() {
    return db.users.filter((u) => !u.deletedAt).toArray();
  },
  async upsert(u: User) {
    await db.users.put(u);
  },
};

export const settingsRepo: SettingsRepo = {
  async get<T = unknown>(key: string) {
    const row = await db.settings.get(key);
    return row?.value as T | undefined;
  },
  async set<T = unknown>(key: string, value: T) {
    const row: Setting = { key, value, updatedAt: new Date().toISOString() };
    await db.settings.put(row);
  },
  async all() {
    return db.settings.toArray();
  },
};

export const syncEventRepo: SyncEventRepo = {
  async append(e: SyncEvent) {
    await db.syncEvents.put(e);
  },
  async list(opts = {}) {
    let coll = db.syncEvents.orderBy('occurredAt');
    if (opts.since) coll = coll.filter((e) => e.occurredAt > opts.since!);
    if (opts.entity) coll = coll.filter((e) => e.entity === opts.entity);
    if (opts.limit) coll = coll.limit(opts.limit);
    return coll.toArray();
  },
};
