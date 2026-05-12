export type ULID = string;
export type ISO = string;

export interface Timestamps {
  createdAt: ISO;
  updatedAt: ISO;
  deletedAt?: ISO | null;
}

export interface Warehouse extends Timestamps {
  id: ULID;
  code: string;
  name: string;
  address?: string;
  notes?: string;
  color?: string;
  icon?: string;
  isDefault: boolean;
  archived: boolean;
}

export interface Category extends Timestamps {
  id: ULID;
  name: string;
  parentId?: ULID | null;
  color?: string;
}

export interface Supplier extends Timestamps {
  id: ULID;
  name: string;
  contact?: string;
  notes?: string;
}

export type Unit = 'unit' | 'kg' | 'g' | 'l' | 'ml' | 'm' | 'box' | (string & {});

export interface Product extends Timestamps {
  id: ULID;
  sku: string;
  name: string;
  description?: string;
  categoryId?: ULID | null;
  supplierId?: ULID | null;
  barcodes: string[];
  unit: Unit;
  costPrice?: number;
  salePrice?: number;
  imageBlob?: Blob;
  taxRate?: number;
  active: boolean;
}

export interface StockLevel {
  id: ULID;
  warehouseId: ULID;
  productId: ULID;
  quantity: number;
  minStock?: number;
  maxStock?: number;
  location?: string;
  lastMovementAt?: ISO;
  updatedAt: ISO;
}

export type MovementType = 'in' | 'out' | 'transfer' | 'adjust';
export type MovementStatus = 'draft' | 'confirmed' | 'reversed';

export interface MovementLine {
  id: ULID;
  movementId: ULID;
  productId: ULID;
  quantity: number;
  unitCost?: number;
  notes?: string;
}

export interface Movement extends Timestamps {
  id: ULID;
  type: MovementType;
  occurredAt: ISO;
  warehouseId?: ULID;
  destinationWarehouseId?: ULID;
  reason: string;
  notes?: string;
  userId?: ULID;
  documentRef?: string;
  status: MovementStatus;
  reversedByMovementId?: ULID;
}

export type StockCountStatus = 'open' | 'closed' | 'cancelled';

export interface StockCount extends Timestamps {
  id: ULID;
  warehouseId: ULID;
  startedAt: ISO;
  closedAt?: ISO;
  status: StockCountStatus;
  scope: 'full' | 'partial';
  filter?: { categoryIds?: ULID[]; productIds?: ULID[] };
  expectedSnapshot: Array<{ productId: ULID; expected: number }>;
  countedLines: Array<{ productId: ULID; counted: number; countedAt: ISO }>;
  adjustmentMovementId?: ULID;
  notes?: string;
}

export interface User extends Timestamps {
  id: ULID;
  name: string;
  color?: string;
  isActive: boolean;
}

export interface Setting {
  key: string;
  value: unknown;
  updatedAt: ISO;
}

export interface SyncEvent {
  id: ULID;
  deviceId: string;
  entity: string;
  entityId: ULID;
  op: 'upsert' | 'delete';
  payload: unknown;
  occurredAt: ISO;
}
