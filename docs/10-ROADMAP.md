# 10 · Roadmap

Plan en fases con hitos medibles. Cada fase termina con una versión instalable y demostrable.

## Fase 0 · Esqueleto (Semana 1) — ✅ completada

**Objetivo:** una app vacía instalable que ya es PWA.

- [x] Inicializar repo con Vite + React + TS + Tailwind.
- [x] Configurar ESLint + Prettier + Vitest. _(husky + lint-staged pendiente, opcional)_
- [x] vite-plugin-pwa con manifest e iconos generados desde SVG con sharp.
- [x] Service Worker funcionando offline (app shell).
- [x] PWA instalable verificada en Android y en iPhone.
- [x] CD a GitHub Pages en cada push a `main`. _(workflow de lint+tests previo al deploy aún por añadir)_

**Done cuando:** se puede instalar la app en un Android y abre offline.

## Fase 1 · MVP usable (Semanas 2–4) — ✅ completada

**Objetivo:** registrar producto, escanear y mover stock.

- [x] Esquema Dexie v1 con productos, almacenes, stock_levels, movements (11 tablas).
- [x] Repositorios + casos de uso (createProduct, createWarehouse, createMovement con transferencia atómica, rebuildStockLevels).
- [x] Pantallas: dashboard, lista de productos, ficha de producto, lista de almacenes, escáner, nuevo movimiento.
- [x] Lector de cámara con @zxing/browser (con flujo iOS-friendly tap-to-start).
- [x] Export/import JSON con detección automática de gzip y modos fusionar/reemplazar.
- [ ] i18n es/en. _(strings actualmente hardcoded en ES; el sistema i18n no está montado)_

**Done cuando:** un usuario con un almacén y 50 productos puede operar un día de trabajo completo sin pegas en un Android de gama media.

## Fase 2 · Producción ligera (Semanas 5–7) — ✅ completada

**Objetivo:** lo que un usuario realista pediría en su primera semana.

- [x] Multi-código de barras por producto.
- [x] Imágenes de producto (captura desde cámara o galería + compresión con canvas a max 800px / JPEG q=0.8).
- [x] Stock mínimo/máximo + alertas en dashboard (con editor de mín/máx y ubicación en la ficha del producto por almacén).
- [x] Histórico de movimientos con filtros (chips por tipo, almacén y rango temporal) y carga incremental (load-more, 50 por página).
- [x] Reportes básicos (stock consolidado por almacén, valoración a coste y a venta, margen).
- [x] Export CSV / XLSX (SheetJS + papaparse) en catálogo, stock y movimientos con filtros aplicados.
- [x] Auto-backup en OPFS con retención (14 últimos).
- [x] Pantalla de configuración con tema, moneda, locale, sonidos, vibración, stock negativo y persistencia.

**Done cuando:** se puede usar como única herramienta para una tienda pequeña con 500 productos.

## Fase 3 · Compartición offline (Semanas 8–9) — ✅ completada

**Objetivo:** dos dispositivos pueden colaborar sin servidor de pago.

- [x] QR para compartir productos (payload `INVK1-PROD:base64url(gzip(json))`).
- [x] Sync P2P por WebRTC con PeerJS (broker público gratuito `0.peerjs.com`).
- [x] UI de "iniciar sesión de sync" — pantalla /sync con modos "Mostrar mi código" (QR + peer-id) y "Conectar a otro dispositivo" (escanear QR o pegar).
- [x] Protocolo de intercambio: snapshot completo (BackupFile gzip-base64) en ambos sentidos + ack + `rebuildStockLevels` al cerrar, que es idempotente sobre los movimientos (ULID únicos garantizan deduplicación).
- [ ] Test E2E con dos pestañas sincronizando. _(skipped por ahora; el protocolo cubre el caso vía reuso de importBackup en merge mode, ya cubierto por tests unitarios)_

**Done cuando:** dos móviles intercambian un día entero de movimientos sin perder datos ni duplicar.

## Fase 4 · Recuentos y operación rápida (Semanas 10–11) — ✅ completada

**Objetivo:** la app es excelente para inventarios físicos.

- [x] Recuentos con modo escaneo continuo (tab "Escanear" en CountDetailPage).
- [x] Pausa/reanudación (un recuento abierto sigue vivo entre sesiones; se ve un tile en el dashboard para continuar).
- [x] Cierre con movimiento de ajuste automático (closeStockCount genera 'in'/'out' según diff; cancelStockCount no toca stock).
- [x] Modo "operación rápida" — escáner full-height con bottom bar de último escaneado y +/-.
- [x] Wake Lock durante recuentos (Screen Wake Lock API; degradación silenciosa en navegadores que no lo soporten).
- [x] Sonidos y vibración configurables (settings.scanSound/Vibration, beep con WebAudio + Vibration API).

**Done cuando:** un recuento de 500 productos en estanterías se hace en menos de 1 hora con un solo operario.

## Fase 5 · Seguridad y resiliencia (Semana 12) — ✅ completada

- [x] PIN de apertura (4-6 dígitos, hash PBKDF2-SHA-256 con 200k iteraciones).
- [x] Backup cifrado con contraseña (AES-GCM 256, magic `INVK1ENC`, header con salt+IV).
- [x] Bloqueo por inactividad (timer configurable: off/1/5/15/30/60 min + opción "bloquear al cerrar la app").
- [x] Pantalla "Salud de los datos" (cuota, persistencia, último backup local, comprobación de integridad: huérfanos y stock negativo, con acción de reconstrucción).
- [x] Reconstrucción de `stock_levels` desde movimientos (use case + acciones en Backup y Salud).

## Fase 6 · Pulido + 1.0 (Semana 13) — ✅ completada

- [x] Auditoría de accesibilidad AA (eslint-plugin-jsx-a11y integrado, skip-to-main, landmarks, document.title sincronizado).
- [x] Pruebas en iPhone real (Safari 16.4+) — verificadas durante el desarrollo (escáner, instalación PWA, sync).
- [x] Performance budget verificado (bundle inicial ≈ 118 KB gz, objetivo < 200 KB).
- [x] Documentación de usuario en `docs/USER_GUIDE.md`.
- [ ] Screenshots PWA en el manifest (manifest sin `screenshots`; opcional para post-1.0).
- [x] Release v1.0.0 (tag git + CHANGELOG.md + página /more/about).

## Backlog (post-1.0)

Revisar [07-FEATURES.md](07-FEATURES.md) sección P2/P3:

- WebDAV / Nextcloud opcional.
- Etiquetas imprimibles con QR.
- Lotes y caducidades.
- Multi-usuario local.
- Tauri para versión desktop empaquetada.
- Yjs/Automerge para CRDT real.

## Métricas de éxito de cada fase

| Fase | Métrica | Objetivo |
|------|---------|----------|
| 0 | Lighthouse PWA | ✅ instalable |
| 1 | Time-to-interactive Moto G | < 3 s |
| 1 | Tiempo de registrar movimiento (escaneo → guardar) | < 8 s |
| 2 | Búsqueda en 10k productos | < 100 ms |
| 3 | Latencia de sync P2P en LAN | < 1 s para 100 eventos |
| 4 | Productos contados por minuto con escáner continuo | ≥ 12 |
| 5 | Coverage tests dominio | ≥ 60% |
| 6 | Lighthouse global | ≥ 90 en todas las categorías |

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Safari iOS purga IndexedDB tras 7 días sin visita | Pedir `storage.persist()` y educar al usuario; auto-backup OPFS |
| Cámara no funciona en algún Android antiguo | Fallback de entrada manual del barcode |
| Datos crecen demasiado (millones de movimientos) | Compactación de bitácora; archivado a fichero exportado |
| Broker PeerJS público deja de funcionar | Permitir broker autoalojado en ajustes |
| Usuario pierde el dispositivo sin backup | Recordatorios de backup; auto-backup en OPFS desde el día uno |
| WebRTC bloqueado por NAT estricto | Permitir configurar STUN/TURN propio en ajustes; fallback a export/import |
