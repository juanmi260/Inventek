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
} from './entities';

export interface WarehouseRepo {
  getAll(): Promise<Warehouse[]>;
  get(id: string): Promise<Warehouse | undefined>;
  upsert(w: Warehouse): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface ProductRepo {
  getAll(): Promise<Product[]>;
  get(id: string): Promise<Product | undefined>;
  findBySku(sku: string): Promise<Product | undefined>;
  findByBarcode(code: string): Promise<Product | undefined>;
  search(q: string, limit?: number): Promise<Product[]>;
  upsert(p: Product): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface CategoryRepo {
  getAll(): Promise<Category[]>;
  upsert(c: Category): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface SupplierRepo {
  getAll(): Promise<Supplier[]>;
  upsert(s: Supplier): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface StockLevelRepo {
  byWarehouse(warehouseId: string): Promise<StockLevel[]>;
  byProduct(productId: string): Promise<StockLevel[]>;
  get(warehouseId: string, productId: string): Promise<StockLevel | undefined>;
  upsert(l: StockLevel): Promise<void>;
}

export interface MovementRepo {
  list(opts?: {
    type?: Movement['type'];
    warehouseId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<Movement[]>;
  get(id: string): Promise<Movement | undefined>;
  upsert(m: Movement): Promise<void>;
  linesByMovement(movementId: string): Promise<MovementLine[]>;
  upsertLine(l: MovementLine): Promise<void>;
}

export interface StockCountRepo {
  list(): Promise<StockCount[]>;
  get(id: string): Promise<StockCount | undefined>;
  upsert(c: StockCount): Promise<void>;
}

export interface UserRepo {
  getAll(): Promise<User[]>;
  upsert(u: User): Promise<void>;
}

export interface SettingsRepo {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  all(): Promise<Setting[]>;
}

export interface SyncEventRepo {
  append(e: SyncEvent): Promise<void>;
  list(opts?: { since?: string; entity?: string; limit?: number }): Promise<SyncEvent[]>;
}
