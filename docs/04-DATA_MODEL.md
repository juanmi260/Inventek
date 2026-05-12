# 04 · Modelo de datos

Todas las entidades tienen:
- `id`: ULID (26 chars, ordenable por tiempo, generable offline sin colisiones).
- `createdAt`, `updatedAt`: ISO 8601 UTC.
- `deletedAt`: ISO 8601 UTC nullable (soft delete para permitir sync sin perder histórico).

> **Por qué ULID y no UUID:** ULID es ordenable cronológicamente y más corto al imprimir; sigue siendo único sin coordinación entre dispositivos, lo que es crítico para el sync P2P.

## Entidades

### Warehouse
```ts
{
  id: ULID,
  code: string,           // corto, único, p.ej. "CEN"
  name: string,
  address?: string,
  notes?: string,
  color?: string,         // hex, para UI
  icon?: string,          // nombre de Lucide
  isDefault: boolean,
  archived: boolean,
  createdAt, updatedAt, deletedAt
}
```

### Category
```ts
{
  id: ULID,
  name: string,
  parentId?: ULID,        // jerárquica opcional
  color?: string,
  createdAt, updatedAt, deletedAt
}
```

### Supplier (opcional)
```ts
{
  id: ULID,
  name: string,
  contact?: string,
  notes?: string,
  createdAt, updatedAt, deletedAt
}
```

### Product
```ts
{
  id: ULID,
  sku: string,            // único, indexado
  name: string,
  description?: string,
  categoryId?: ULID,
  supplierId?: ULID,
  barcodes: string[],     // EAN/UPC/QR. Un producto puede tener varios.
  unit: 'unit' | 'kg' | 'g' | 'l' | 'ml' | 'm' | 'box' | string,
  costPrice?: number,     // en la moneda configurada
  salePrice?: number,
  imageBlob?: Blob,       // miniatura local (<100 KB recomendado)
  taxRate?: number,       // %
  active: boolean,
  createdAt, updatedAt, deletedAt
}
```

### StockLevel
Estado **derivado** pero materializado para queries rápidas.
```ts
{
  id: ULID,                // o clave compuesta (warehouseId, productId)
  warehouseId: ULID,
  productId: ULID,
  quantity: number,
  minStock?: number,
  maxStock?: number,
  location?: string,       // pasillo/estante interno
  lastMovementAt?: string,
  updatedAt
}
```
Índice único compuesto en `(warehouseId, productId)`.

### Movement
Es el **único** modo de cambiar `quantity` en `StockLevel`. **Inmutable** tras confirmación.

```ts
{
  id: ULID,
  type: 'in' | 'out' | 'transfer' | 'adjust',
  occurredAt: string,           // momento real del movimiento
  warehouseId?: ULID,           // origen para out/transfer, destino para in
  destinationWarehouseId?: ULID,// solo en transfer
  reason: string,               // 'purchase' | 'sale' | 'return' | 'shrinkage' | 'count-adjust' | 'manual' | ...
  notes?: string,
  userId?: ULID,                // perfil local opcional
  lines: MovementLine[],
  documentRef?: string,         // ej. nº de albarán
  status: 'draft' | 'confirmed' | 'reversed',
  reversedByMovementId?: ULID,  // si status=reversed, apunta al movimiento que lo anuló
  createdAt, updatedAt
}

MovementLine = {
  id: ULID,
  productId: ULID,
  quantity: number,             // siempre positiva; el signo lo da el tipo
  unitCost?: number,            // para valoración
  notes?: string
}
```

### StockCount (recuento físico)
```ts
{
  id: ULID,
  warehouseId: ULID,
  startedAt: string,
  closedAt?: string,
  status: 'open' | 'closed' | 'cancelled',
  scope: 'full' | 'partial',
  filter?: { categoryIds?: ULID[]; productIds?: ULID[] },
  expectedSnapshot: Array<{ productId: ULID; expected: number }>,
  countedLines: Array<{ productId: ULID; counted: number; countedAt: string }>,
  adjustmentMovementId?: ULID,  // se rellena al cerrar
  notes?: string,
  createdAt, updatedAt
}
```

### User (perfil local, opcional)
```ts
{
  id: ULID,
  name: string,
  color?: string,
  isActive: boolean,
  createdAt, updatedAt, deletedAt
}
```

### Setting
Clave-valor simple.
```ts
{ key: string, value: unknown, updatedAt }
```

### SyncEvent (para sync P2P, ver doc 06)
```ts
{
  id: ULID,                 // monotónico por dispositivo
  deviceId: string,         // identificador local del dispositivo
  entity: string,           // 'product' | 'movement' | ...
  entityId: ULID,
  op: 'upsert' | 'delete',
  payload: unknown,         // estado completo de la entidad tras la op
  occurredAt: string
}
```

## Relaciones

```
Warehouse 1 ──── N StockLevel N ──── 1 Product
                                          │
                                          │ 1
                                          │
                                          N
                                       Category (parent N→1)

Movement 1 ── N MovementLine ── 1 Product
Movement N → 1 Warehouse (origen)
Movement N → 1 Warehouse (destino, solo transfer)

StockCount N → 1 Warehouse
StockCount 1 → 1 Movement (ajuste resultante)
```

## Reglas de integridad

1. **Producto referenciado no se elimina físicamente** si tiene movimientos: solo soft delete (`deletedAt`).
2. **Cantidad nunca negativa** en `StockLevel` salvo que el ajuste lo permita explícitamente (config "permitir stock negativo" off por defecto).
3. **Transferencia atómica**: la salida del origen y la entrada del destino se aplican en la misma transacción; si falla una, fallan ambas.
4. **SKU único** dentro del tenant local (la app es monoinquilino).
5. **Códigos de barras**: un mismo código puede pertenecer **a un solo producto activo** a la vez.

## Volúmenes esperados

| Entidad | Volumen objetivo | Volumen máx. soportado |
|---------|------------------|------------------------|
| Warehouses | 1–10 | 100 |
| Products | 1k–10k | 50k |
| StockLevels | 10k–100k | 500k |
| Movements | 100k/año | 1M acumulados |
| MovementLines | 500k/año | 5M acumulados |

Estos volúmenes son perfectamente viables en IndexedDB con los índices adecuados.

## Índices Dexie recomendados

```ts
products: 'id, sku, name, *barcodes, categoryId, active, deletedAt'
warehouses: 'id, code, archived, deletedAt'
stockLevels: 'id, [warehouseId+productId], warehouseId, productId, quantity'
movements: 'id, occurredAt, type, warehouseId, destinationWarehouseId, status'
movementLines: 'id, movementId, productId'
stockCounts: 'id, warehouseId, status, startedAt'
syncEvents: 'id, deviceId, entity, entityId, occurredAt'
```
