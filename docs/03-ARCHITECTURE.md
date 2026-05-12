# 03 · Arquitectura

## Visión de capas

```
 ┌──────────────────────────────────────────────────┐
 │  UI (React components, Tailwind, Radix)          │  ← Pantallas, formularios, lectores
 ├──────────────────────────────────────────────────┤
 │  Estado de aplicación (Zustand)                  │  ← Estado de sesión, filtros, UI
 ├──────────────────────────────────────────────────┤
 │  Dominio (servicios + casos de uso, puro TS)     │  ← Reglas de negocio, validaciones
 ├──────────────────────────────────────────────────┤
 │  Persistencia (Dexie / IndexedDB)                │  ← Repositorios, migraciones
 ├──────────────────────────────────────────────────┤
 │  Plataforma (PWA, cámara, ficheros, WebRTC)      │  ← Adaptadores de APIs del navegador
 └──────────────────────────────────────────────────┘
```

**Regla de dependencia:** las capas inferiores no conocen a las superiores. El dominio no importa nada de React ni de Dexie directamente; recibe los repositorios por interfaz.

## Patrones

- **Repository pattern** sobre Dexie: la lógica de dominio depende de interfaces (`ProductRepository`, `MovementRepository`…), no del ORM.
- **Casos de uso** explícitos: `CreateMovement`, `TransferStock`, `CloseStockCount`, etc. Cada uno es una función pura que recibe repositorios y datos y devuelve un resultado tipado.
- **Inmutabilidad**: los movimientos confirmados no se editan; se crean movimientos de reversa.
- **Event log opcional**: cada cambio relevante puede registrar un evento (útil para el sync P2P, ver doc 06).

## Estructura de carpetas

```
inventek/
├─ public/                       # Iconos, manifest, screenshots PWA
├─ src/
│  ├─ app/                       # Bootstrap, router, providers
│  │  ├─ App.tsx
│  │  ├─ router.tsx
│  │  └─ providers.tsx
│  ├─ pages/                     # Pantallas (vistas de ruta)
│  │  ├─ dashboard/
│  │  ├─ warehouses/
│  │  ├─ products/
│  │  ├─ movements/
│  │  ├─ stock-counts/
│  │  ├─ reports/
│  │  ├─ share/
│  │  └─ settings/
│  ├─ features/                  # Componentes ricos por dominio
│  │  ├─ scanner/                # Lector de cámara
│  │  ├─ stock-table/
│  │  └─ ...
│  ├─ ui/                        # Design system: Button, Input, Sheet, etc.
│  ├─ domain/                    # Núcleo, sin dependencias de UI ni DB
│  │  ├─ entities/               # Tipos: Product, Warehouse, Movement...
│  │  ├─ services/               # Lógica pura (cálculo de stock, valoración)
│  │  ├─ use-cases/              # Casos de uso (CreateMovement, etc.)
│  │  └─ ports/                  # Interfaces de repositorios
│  ├─ data/                      # Implementación de persistencia
│  │  ├─ db.ts                   # Definición Dexie
│  │  ├─ migrations/             # v1.ts, v2.ts...
│  │  └─ repositories/           # Implementaciones de ports/
│  ├─ platform/                  # Adaptadores de APIs del navegador
│  │  ├─ camera.ts
│  │  ├─ file-system.ts          # File System Access API
│  │  ├─ qr.ts
│  │  ├─ webrtc/                 # PeerJS / DataChannel
│  │  └─ crypto.ts               # WebCrypto helpers
│  ├─ state/                     # Stores Zustand
│  ├─ i18n/                      # Diccionarios
│  ├─ utils/
│  └─ main.tsx
├─ tests/
├─ docs/
├─ index.html
├─ tsconfig.json
├─ vite.config.ts
└─ package.json
```

## Flujo de ejecución típico

Ejemplo: usuario escanea un código en el almacén "Central" y registra una salida de 2 unidades.

```
ScanPage.tsx
  → useCamera() lee frame
  → @zxing/browser decodifica → "8412345678901"
  → useProductByBarcode("8412345678901")
       → productRepo.findByBarcode(...)
  → muestra producto + form de cantidad
  → onSubmit → useCase(CreateMovement)
       valida (Zod)
       abre transacción Dexie
       inserta movement + actualiza stock_level
       commit
  → invalidación de stores de stock
  → UI muestra toast + nuevo nivel
```

## Cómo se asegura la consistencia del stock

El stock **no se almacena como columna libre**; se mantiene en una tabla `stock_levels(warehouseId, productId)` que solo se actualiza:

1. Dentro de la **misma transacción Dexie** que inserta el movimiento.
2. Con la fórmula `nuevo = anterior + delta`, donde `delta` depende del tipo de movimiento.

Existe un comando de **reconstrucción** (`rebuildStockLevels`) que recalcula `stock_levels` desde cero recorriendo todos los movimientos. Es el "fsck" del inventario y se usa tras un import o si se detecta inconsistencia.

## Errores y recuperación

- Los errores de dominio son tipados (`Result<T, DomainError>`). No se lanzan excepciones para casos previstos.
- Los errores inesperados se capturan en un `ErrorBoundary` que ofrece "exportar datos" antes de cualquier otra acción.
- Cada operación destructiva (eliminar almacén, importar reemplazando) requiere confirmación con texto.

## Service Worker

- Cache de assets de la app (precaching, estrategia `CacheFirst`).
- **No** se cachean datos del usuario (viven en IndexedDB, no en cache HTTP).
- Estrategia `NetworkFirst` solo para `index.html` para detectar nuevas versiones.
- UI de "hay una actualización disponible" controlada por la app.
