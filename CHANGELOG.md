# Changelog

Todas las versiones notables de Inventek.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [1.1.2] — 2026-05-15

### Añadido
- **Auto-sync debounced** tras cada cambio local. Hook Dexie sobre
  `syncEvents` que detecta inserciones con `deviceId === local` y
  programa una sincronización 2 segundos después. Bursts de cambios
  (p. ej. una entrada con varias líneas) se acumulan y disparan un
  único sync al final.
- Si una sincronización ya está en curso, el auto-sync no interfiere.
- Eventos aplicados desde un peer (deviceId remoto) no disparan el
  timer, evitando bucles de sincronización.

### Limitación conocida
- Los cambios hechos en el **primario** no se empujan a las réplicas
  todavía. Para verlos en una réplica hay que (a) hacer un cambio en
  la réplica (arrastra los del primario al sincronizar), (b) reabrir
  la app o (c) tocar "Sincronizar ahora con el primario".

## [1.1.1] — 2026-05-15

Fixes tras el primer test del flujo de sync continua.

### Corregido
- **Tras promover un dispositivo a primario, el Peer se reinicia con el
  peer-id estable.** Antes, el dispositivo se quedaba escuchando con el
  peer-id aleatorio del primer emparejamiento, así que las réplicas que
  intentaban reconectar al primario buscaban `inventek-<ulid>` y nadie
  estaba escuchando ahí. Ahora la promoción dispara un `restartHost()`
  que recarga el listener con el id correcto.
- **`rebuildStockLevels` preserva `minStock`/`maxStock`/`location`.**
  Antes, el rebuild hacía `clear()` y los perdía: si una réplica
  recibía un evento `stockLevelLimits` y luego se reconstruía el stock,
  esos límites desaparecían.
- **Tras aplicar eventos, el rebuild de stock corre siempre que haya
  cambios** (no solo cuando llegan movimientos). Así los cambios de
  límites también se reflejan correctamente en la fila de stock.

### Mejorado
- El error `Could not connect to peer …` se trata como un **estado
  suave "peer-unavailable"** (el primario no tiene la app abierta), no
  como error duro. El tile del dashboard muestra "Primario fuera de
  línea" y en `/sync` aparece un aviso amarillo, no rojo.
- **El listener del primario es persistente**: si pulsas "Cancelar" en
  `/sync` mientras estás esperando una réplica, ya no se destruye el
  Peer — solo se oculta la UI. El primario sigue escuchando hasta que
  se cierra la app.
- Si abres `/sync` y ya estás escuchando con el peer-id correcto, no
  se reinicia el listener (idempotente).
- **Reconexión automática al broker** (`peer.on('disconnected')`) por
  si la WebSocket cae después de un período largo abierto.
- La UI de `/sync` muestra ahora el **detalle por entidad** tras un sync:
  *"3 cambios aplicados: 2 productos · 1 movimiento"*.
- Botón **"Sincronizar ahora con el primario"** siempre visible cuando
  hay primario configurado y la app no está sincronizando.

## [1.1.0] — 2026-05-15

Sincronización continua con bitácora de eventos y topología primario / réplica.

### Añadido (Fase 7)

#### Bitácora `syncEvents`
- Cada use case que muta dominio (`createProduct`, `updateProduct`,
  `createWarehouse`, `updateWarehouse`, `createMovement`, `setStockLimits`,
  `startStockCount`, `incrementCount`, `setCountQuantity`,
  `removeCountedItem`, `closeStockCount`, `cancelStockCount`,
  `productRepo.remove`, `warehouseRepo.remove`) escribe un `SyncEvent`
  dentro de la misma transacción Dexie que el cambio.
- Entidades sincronizadas: `product` (con `imageBlob` en base64),
  `warehouse`, `movement` (con sus `lines` en el payload, inmutable por
  ULID), `stockLevelLimits` (solo `min/max/location` — la cantidad
  no se sincroniza, se recomputa), `stockCount` y `setting`.

#### Protocolo delta sync
- `p2pSync` reescrito: `hello` con `deviceId + watermarks + fingerprint`,
  intercambio de batches de eventos `done?`, `ack` final.
- `applyEvents` idempotente: filtra por id ya conocido, aplica LWW por
  `updatedAt`, persiste el evento original con `id` y `deviceId` del
  autor. Tras aplicar movements, `rebuildStockLevels` recompone los
  niveles.
- `eventsNewerThan(peer.watermarks)` calcula qué deltas mandar.

#### Topología primario / réplica
- Setting compartido `sync.primary` con `peerId + deviceId + updatedAt`,
  propagado como evento más → todas las réplicas aprenden quién es el
  primario en su próxima sync.
- Peer-id estable derivado del `deviceId` (`inventek-<ulid>`) para que
  las réplicas reconecten sin volver a escanear QR.
- Promoción con precondición de huella (`canPromoteSelf` /
  `fingerprintsMatch`): solo se puede promover si el estado local
  coincide exactamente con la huella registrada del primario.

#### Autoreconexión y UI
- `SyncProvider` que al desbloquear la app intenta una vez: el primario
  abre listener, la réplica conecta al primario conocido.
- Tile de estado en el dashboard: *Sincronizado / Sincronizando /
  Sin conexión con primario / Soy primario · escuchando / Error*.
- `/sync` rediseñada con tarjeta del primario actual, opción
  "Reconectar al primario" y "Hacerme primario" con validación de huella.

### Tests
- 8 tests nuevos en `tests/syncEvents.test.ts`: emisión durante use
  cases, idempotencia, LWW, watermarks, replay de un movement de otro
  dispositivo, huellas iguales/distintas.

## [1.0.0] — 2026-05-13

Primera release estable. Las seis fases del roadmap completas.

### Añadido

#### Núcleo (Fase 1)
- PWA instalable con manifest, service worker (Workbox) y prompt de
  actualización en cliente.
- Esquema Dexie v1 con 11 tablas: warehouses, categories, suppliers,
  products, stockLevels, movements, movementLines, stockCounts, users,
  settings y syncEvents.
- Casos de uso atómicos: createMovement (entradas, salidas,
  transferencias y ajustes), createProduct, createWarehouse,
  setStockLimits, rebuildStockLevels.
- Pantallas móvil-first: dashboard, productos (lista, detalle, edición),
  almacenes, escáner, movimientos (lista y formulario).
- Escáner de cámara con `@zxing/browser`, con flujo iOS-friendly de
  tap-to-start y manejo de errores nombrados.
- Export/import de backups en JSON con detección automática de gzip
  (`.json` / `.json.gz`).

#### Producción ligera (Fase 2)
- Multi-código de barras por producto.
- Imágenes de producto (cámara nativa o galería) con compresión por
  canvas a max 800 px / JPEG q=0.8.
- Stock mínimo/máximo + ubicación interna por (producto, almacén) con
  editor inline y alertas en el dashboard.
- Histórico de movimientos con filtros chip (tipo, almacén, rango
  temporal) y carga incremental (load-more 50 en 50).
- Reportes: stock consolidado por almacén y valoración (a coste, a
  venta y margen potencial).
- Export a CSV y XLSX (SheetJS + papaparse) en catálogo, stock y
  movimientos con filtros aplicados.
- Auto-backup local en OPFS con retención de los últimos 14, con
  fallback a IndexedDB separado (`inventek_backups`) en iOS Safari.
- Ajustes ampliados: moneda, idioma/formato, sonido y vibración al
  escanear, permitir stock negativo.

#### Compartición offline (Fase 3)
- QR de producto individual con prefijo `INVK1-PROD:` (payload
  gzip+base64url).
- Sync P2P por WebRTC con PeerJS y broker público gratuito. Protocolo
  string-JSON: hello → snapshot (BackupFile gzip+base64) → ack.
  Idempotencia garantizada por ULIDs de movimientos y
  `rebuildStockLevels` al cerrar.
- Pantalla /sync con dos modos: host (muestra QR + peer-id) y guest
  (escanea o pega el código). Estado en vivo de bytes y registros.
- Deep link `/sync?peer=<id>` cuando el escáner general detecta un QR
  de tipo peer.
- Botón "Compartir QR" en la ficha del producto.

#### Recuentos físicos (Fase 4)
- Use cases: startStockCount (snapshot del stock al iniciar),
  incrementCount/setCountQuantity/removeCountedItem, closeStockCount
  (genera 0, 1 o 2 movimientos `count-adjust`), cancelStockCount.
- Pantallas /counts (lista), /counts/new (form con alcance completo o
  parcial) y /counts/:id con dos tabs:
  - Lista con búsqueda, filtros (sin contar / contado / con diferencia)
    y edición manual por sheet.
  - Escanear con cámara permanente; cada lectura +1, bar inferior con
    último escaneado y +/− para afinar.
- Screen Wake Lock automático en pestaña Escanear; re-acquisition
  tras volver del background.
- Tile "Recuento en curso" en el dashboard del almacén activo.

#### Seguridad y resiliencia (Fase 5)
- PIN de apertura 4-6 dígitos con teclado numérico. Hash
  PBKDF2-SHA-256 (200 000 iteraciones) + sal aleatoria, verificación
  en tiempo constante.
- Bloqueo por inactividad configurable: off / 1 / 5 / 15 / 30 / 60 min.
  Reseteable por cualquier mousemove/touch/keydown/scroll.
- Bloqueo opcional al perder visibilidad de la pestaña.
- Backup cifrado con contraseña (AES-GCM 256, magic `INVK1ENC`, header
  con salt + IV). Import detecta automáticamente blobs cifrados y pide
  passphrase.
- Página "Salud de los datos" con cuota, persistencia, último backup
  local y comprobación de integridad (huérfanos y stock negativo) con
  acción de reconstrucción.

#### Pulido (Fase 6)
- Skip-to-main link y landmarks ARIA en el Layout.
- `eslint-plugin-jsx-a11y` integrado en la configuración de lint.
- `document.title` se sincroniza con el título de cada página.
- Workflow CI separado del deploy (lint + typecheck + tests + build).
- Guía de usuario completa en `docs/USER_GUIDE.md`.

### Tests
- 23 tests unitarios cubriendo movimientos atómicos, recuentos con
  diffs mixtos, cifrado/descifrado y PIN.

### Performance
- Bundle inicial gz (Dashboard): ~115 KB (objetivo < 200 KB ✓).
- TTI en gama media estimado < 3 s.
- Service Worker precachea 81 entries (≈1.5 MB raw).

### No incluido aún (backlog post-1.0)
- i18n real (las cadenas están hardcoded en español).
- Lotes y caducidades.
- Multi-usuario local con trazabilidad por operario.
- Notificaciones push para mínimos de stock.
- WebDAV / Nextcloud / Gist como destinos opcionales de backup.
- Versión desktop empaquetada con Tauri.
