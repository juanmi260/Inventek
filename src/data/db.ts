import Dexie, { type Table } from 'dexie';
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
  Warehouse,
} from '@/domain/entities';

export class InventekDB extends Dexie {
  warehouses!: Table<Warehouse, string>;
  categories!: Table<Category, string>;
  suppliers!: Table<Supplier, string>;
  products!: Table<Product, string>;
  stockLevels!: Table<StockLevel, string>;
  movements!: Table<Movement, string>;
  movementLines!: Table<MovementLine, string>;
  stockCounts!: Table<StockCount, string>;
  users!: Table<User, string>;
  settings!: Table<Setting, string>;
  syncEvents!: Table<SyncEvent, string>;

  constructor(name = 'inventek') {
    super(name);
    this.version(1).stores({
      warehouses: 'id, code, archived, deletedAt, isDefault',
      categories: 'id, name, parentId, deletedAt',
      suppliers: 'id, name, deletedAt',
      products: 'id, sku, name, *barcodes, categoryId, active, deletedAt',
      stockLevels: 'id, [warehouseId+productId], warehouseId, productId, quantity, updatedAt',
      movements:
        'id, occurredAt, type, warehouseId, destinationWarehouseId, status, createdAt',
      movementLines: 'id, movementId, productId',
      stockCounts: 'id, warehouseId, status, startedAt',
      users: 'id, name, isActive, deletedAt',
      settings: 'key, updatedAt',
      syncEvents: 'id, deviceId, entity, entityId, occurredAt',
    });
  }
}

export const db = new InventekDB();
