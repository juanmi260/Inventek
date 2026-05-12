# 10 · Roadmap

Plan en fases con hitos medibles. Cada fase termina con una versión instalable y demostrable.

## Fase 0 · Esqueleto (Semana 1)

**Objetivo:** una app vacía instalable que ya es PWA.

- [ ] Inicializar repo con Vite + React + TS + Tailwind.
- [ ] Configurar ESLint + Prettier + husky + lint-staged + Vitest.
- [ ] vite-plugin-pwa con manifest e iconos placeholder.
- [ ] Service Worker funcionando offline (app shell).
- [ ] Pantalla "Hola mundo" instalable, supera auditoría PWA de Lighthouse.
- [ ] CI mínima (lint + tests) en GitHub Actions.

**Done cuando:** se puede instalar la app en un Android y abre offline.

## Fase 1 · MVP usable (Semanas 2–4)

**Objetivo:** registrar producto, escanear y mover stock.

- [ ] Esquema Dexie v1 con productos, almacenes, stock_levels, movements.
- [ ] Repositorios + casos de uso (`CreateProduct`, `CreateMovement`, `TransferStock`).
- [ ] Pantallas: dashboard, lista de productos, ficha de producto, lista de almacenes, escáner, nuevo movimiento.
- [ ] Lector de cámara con @zxing/browser.
- [ ] Export/import JSON.
- [ ] i18n es/en.

**Done cuando:** un usuario con un almacén y 50 productos puede operar un día de trabajo completo sin pegas en un Android de gama media.

## Fase 2 · Producción ligera (Semanas 5–7)

**Objetivo:** lo que un usuario realista pediría en su primera semana.

- [ ] Multi-código de barras por producto.
- [ ] Imágenes de producto.
- [ ] Stock mínimo/máximo + alertas en dashboard.
- [ ] Histórico de movimientos con filtros y virtualización.
- [ ] Reportes básicos (stock, valoración).
- [ ] Export CSV / XLSX (SheetJS).
- [ ] Auto-backup en OPFS con retención.
- [ ] Pantalla de configuración completa.

**Done cuando:** se puede usar como única herramienta para una tienda pequeña con 500 productos.

## Fase 3 · Compartición offline (Semanas 8–9)

**Objetivo:** dos dispositivos pueden colaborar sin servidor de pago.

- [ ] QR para compartir productos y transferencias.
- [ ] Sync P2P por WebRTC con PeerJS.
- [ ] UI de "iniciar sesión de sync" (mostrar/escanear código).
- [ ] Bitácora `syncEvents` y replay idempotente.
- [ ] Test E2E con dos pestañas sincronizando.

**Done cuando:** dos móviles intercambian un día entero de movimientos sin perder datos ni duplicar.

## Fase 4 · Recuentos y operación rápida (Semanas 10–11)

**Objetivo:** la app es excelente para inventarios físicos.

- [ ] Recuentos con modo escaneo continuo.
- [ ] Pausa/reanudación.
- [ ] Cierre con movimiento de ajuste automático.
- [ ] Modo "operación rápida" (pantalla grande con escáner permanente).
- [ ] Wake Lock durante recuentos.
- [ ] Sonidos y vibración configurables.

**Done cuando:** un recuento de 500 productos en estanterías se hace en menos de 1 hora con un solo operario.

## Fase 5 · Seguridad y resiliencia (Semana 12)

- [ ] PIN de apertura.
- [ ] Backup cifrado con contraseña.
- [ ] Bloqueo por inactividad.
- [ ] Pantalla "salud de los datos" (espacio, integridad, último backup).
- [ ] Reconstrucción de `stock_levels` desde movimientos.

## Fase 6 · Pulido + 1.0 (Semana 13)

- [ ] Auditoría de accesibilidad AA.
- [ ] Pruebas en iPhone real (Safari 16.4+).
- [ ] Performance budget verificado.
- [ ] Documentación de usuario.
- [ ] Captura de pantalla + screenshots PWA.
- [ ] Release v1.0.

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
