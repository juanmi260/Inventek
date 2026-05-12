# 05 · Almacenamiento local

## Resumen

| Necesidad | Tecnología | Por qué |
|-----------|------------|---------|
| Datos estructurados (entidades, movimientos) | **IndexedDB vía Dexie** | Volumen alto, índices, transacciones |
| Preferencias y estado UI ligero | **localStorage** | API simple, suficiente para <5 MB |
| Identificador de dispositivo | **localStorage** | Persiste mientras no se borre el sitio |
| Imágenes de producto | **IndexedDB como Blob** | Empaquetadas con los datos |
| Backups exportados | **File System Access API** (con fallback a `<a download>`) | Acceso al sistema de ficheros del usuario |
| Auto-backups recientes | **OPFS** (Origin Private File System) | Aislado, persistente, no requiere permiso |

## IndexedDB con Dexie

### Definición de base

```ts
import Dexie, { type Table } from 'dexie';

export class InventekDB extends Dexie {
  warehouses!:    Table<Warehouse,    string>;
  categories!:    Table<Category,     string>;
  suppliers!:     Table<Supplier,     string>;
  products!:      Table<Product,      string>;
  stockLevels!:   Table<StockLevel,   string>;
  movements!:     Table<Movement,     string>;
  movementLines!: Table<MovementLine, string>;
  stockCounts!:   Table<StockCount,   string>;
  users!:         Table<User,         string>;
  settings!:      Table<Setting,      string>;
  syncEvents!:    Table<SyncEvent,    string>;

  constructor() {
    super('inventek');
    this.version(1).stores({
      warehouses:    'id, code, archived, deletedAt',
      categories:    'id, name, parentId, deletedAt',
      suppliers:     'id, name, deletedAt',
      products:      'id, sku, name, *barcodes, categoryId, active, deletedAt',
      stockLevels:   'id, [warehouseId+productId], warehouseId, productId, quantity',
      movements:     'id, occurredAt, type, warehouseId, destinationWarehouseId, status',
      movementLines: 'id, movementId, productId',
      stockCounts:   'id, warehouseId, status, startedAt',
      users:         'id, name, isActive, deletedAt',
      settings:      'key',
      syncEvents:    'id, deviceId, entity, entityId, occurredAt'
    });
  }
}
```

### Migraciones

Cada nueva versión va en `src/data/migrations/vN.ts` y se compone declarativamente sobre Dexie:

```ts
this.version(2).stores({
  products: 'id, sku, name, *barcodes, categoryId, active, deletedAt, brand'
}).upgrade(async tx => {
  await tx.table('products').toCollection().modify(p => {
    p.brand = p.brand ?? '';
  });
});
```

Reglas:
- **Nunca borrar campos** entre versiones; marcarlos `deprecated` y dejar de usarlos.
- Cada migración debe tener test que parta de un snapshot de la versión anterior.
- Antes de migrar, **forzar un backup automático** a OPFS, etiquetado `pre-vN`.

### Transacciones

Toda operación que toque más de una tabla va dentro de:

```ts
await db.transaction('rw', db.movements, db.movementLines, db.stockLevels, async () => {
  // ...
});
```

Si la transacción aborta (error en cualquier paso), Dexie revierte automáticamente.

## Persistencia "promovida"

Para evitar que el navegador desaloje los datos:

```ts
if (navigator.storage?.persist) {
  await navigator.storage.persist();
}
```

Se llama al primer arranque y se muestra al usuario un aviso si la solicitud es denegada explicándole que sus datos podrían eliminarse en condiciones de poco espacio.

Cuota disponible:
```ts
const { quota, usage } = await navigator.storage.estimate();
```
Se muestra en la pantalla de configuración.

## OPFS para auto-backups

OPFS (Origin Private File System) permite escribir ficheros que el navegador conserva igual que IndexedDB pero sin necesidad de pedir permiso.

```ts
const root = await navigator.storage.getDirectory();
const dir = await root.getDirectoryHandle('backups', { create: true });
const file = await dir.getFileHandle(`inventek-${ts}.json.gz`, { create: true });
const w = await file.createWritable();
await w.write(gzipped);
await w.close();
```

Política de retención por defecto: **últimos 14 backups diarios + último de cada mes durante 12 meses.**

## File System Access API (export real al disco)

Cuando el usuario pulsa "Exportar", si el navegador soporta la API se usa `showSaveFilePicker` y el archivo va a la ubicación que elija. Fallback: descarga clásica vía Blob URL.

```ts
if ('showSaveFilePicker' in window) {
  const handle = await window.showSaveFilePicker({
    suggestedName: `inventek-${date}.json`,
    types: [{ description: 'Inventek backup', accept: { 'application/json': ['.json'] } }]
  });
  // ...
}
```

iOS Safari no soporta esta API: se usará el fallback (Web Share API + descarga directa).

## Formato del backup

```json
{
  "$schema": "inventek/backup/v1",
  "exportedAt": "2026-05-12T12:00:00.000Z",
  "deviceId": "dev_01HXY...",
  "appVersion": "0.4.0",
  "data": {
    "warehouses":    [...],
    "categories":    [...],
    "suppliers":     [...],
    "products":      [...],
    "stockLevels":   [...],
    "movements":     [...],
    "movementLines": [...],
    "stockCounts":   [...],
    "users":         [...],
    "settings":      [...]
  }
}
```

Se comprime con gzip (extensión `.json.gz`) por defecto. Los `Blob` de imágenes van en base64.

### Backup cifrado (opcional)

Si el usuario activa "exportar con contraseña":
- Derivar clave con **PBKDF2-SHA-256** (200 000 iteraciones) y sal aleatoria de 16 bytes.
- Cifrar con **AES-GCM 256** (IV aleatorio de 12 bytes).
- Empaquetar como:
  ```
  INVK1 || salt(16) || iv(12) || ciphertext
  ```
- Extensión sugerida: `.inventek.enc`.

## localStorage

Limitado a:
- `inventek.deviceId` (ULID generado al primer arranque).
- `inventek.locale`, `inventek.theme`.
- `inventek.lastBackupCheck`.

**No** almacenar datos de inventario aquí.

## Borrado de datos

Configuración → "Borrar todos los datos":
1. Doble confirmación con texto.
2. Auto-backup forzoso a OPFS antes de borrar.
3. `await db.delete()` + limpieza de localStorage + caches del SW.
4. Recarga la app.
