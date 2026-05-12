# 02 · Requisitos

## Requisitos funcionales

### RF-01 · Gestión de almacenes
- Crear, editar, archivar y eliminar almacenes.
- Cada almacén tiene: nombre, código corto, dirección (opcional), notas, color/icono identificador.
- Soporte para **1..N almacenes** sin límite duro.
- Marcar uno como "predeterminado" para nuevas operaciones.

### RF-02 · Catálogo de productos
- Alta, modificación y baja de productos.
- Campos: SKU (único), nombre, descripción, categoría, **código de barras (EAN/UPC/QR)**, unidad de medida, precio de coste (opcional), precio de venta (opcional), imagen, proveedor (opcional).
- Búsqueda por SKU, nombre, código de barras o categoría.
- **Lector de cámara** para capturar el código de barras al alta y para localizar productos.

### RF-03 · Stock por almacén
- Cada par (producto, almacén) tiene un nivel de stock.
- Configurables por producto-almacén: **stock mínimo**, **stock máximo**, ubicación interna (pasillo/estante).
- Vista global "stock consolidado" sumando todos los almacenes.

### RF-04 · Movimientos
La app **no muta el stock directamente**; siempre se hace a través de un movimiento:
- **Entrada** (compra, devolución cliente, ajuste positivo).
- **Salida** (venta, consumo, merma, ajuste negativo).
- **Transferencia entre almacenes** (genera salida + entrada atómicas).
- **Recuento / inventario físico** (genera ajustes automáticos contra el conteo).

Cada movimiento guarda: fecha/hora, tipo, motivo, productos+cantidades, almacén(es), usuario local (opcional), nota libre. **Inmutable** una vez confirmado (auditable).

### RF-05 · Inventarios físicos (recuentos)
- Modo "recuento" que congela cantidades esperadas y permite contar uno por uno con el lector.
- Al cerrar, genera un movimiento de ajuste con la diferencia.
- Puede pausarse y reanudarse.

### RF-06 · Alertas
- Lista de productos por debajo de stock mínimo.
- Notificación local (no push de servidor) opcional al cruzar el umbral.

### RF-07 · Reportes
- Stock actual por almacén y consolidado.
- Histórico de movimientos filtrable (rango fechas, producto, almacén, tipo).
- Valoración de stock (a coste y a venta).
- Exportable a **CSV** y **XLSX**.

### RF-08 · Importación / Exportación
- **Exportar todo** a un fichero `.inventek.json` (con todos los almacenes, productos, movimientos).
- **Importar** desde el mismo formato (con confirmación, opción de fusionar o sustituir).
- Importar catálogo de productos desde **CSV / XLSX** (con mapeo de columnas).

### RF-09 · Compartición entre dispositivos
Ver detalle en [06-SHARING_SYNC.md](06-SHARING_SYNC.md). Mecanismos:
- Fichero exportado (compartido por cualquier vía que el usuario use).
- **QR code** para fragmentos pequeños (un producto, un movimiento, una transferencia pendiente).
- **Sync P2P por WebRTC** entre dos dispositivos en la misma red o conectados por internet.

### RF-10 · Usuarios locales (opcional, v2)
- Cada dispositivo puede tener un perfil local (nombre, color). No es autenticación: solo trazabilidad en los movimientos.
- Sin servidor, sin contraseñas.

### RF-11 · Configuración
- Moneda, formato de fecha/hora, idioma (es/en mínimo).
- Tema claro / oscuro / sistema.
- Activar/desactivar sonidos de escaneo.
- Configurar broker de WebRTC (público o autoalojado).

### RF-12 · Backup y restauración
- Backup manual a fichero.
- **Auto-backup programado** al almacenamiento local del dispositivo (carpeta Descargas vía File System Access API cuando esté disponible).
- Retención configurable (últimos N backups).

## Requisitos no funcionales

### RNF-01 · Offline-first
La app debe ser **100% funcional sin conexión** después de la primera carga. Toda la lógica corre en cliente.

### RNF-02 · Instalable como PWA
- Manifest válido.
- Service worker con estrategias de cache.
- Iconos para Android, iOS y desktop.
- Pasa la auditoría PWA de Lighthouse (>90).

### RNF-03 · Rendimiento
- TTI en gama media < 3 s.
- Operaciones de stock (lectura/escritura) < 200 ms con 10 000 productos y 100 000 movimientos.
- Búsqueda en catálogo < 100 ms.

### RNF-04 · Privacidad
- **Nada se envía a internet por defecto.** El usuario debe activar explícitamente cualquier compartición.
- Sin telemetría. Sin analytics de terceros.
- Logs solo en el dispositivo y borrables.

### RNF-05 · Portabilidad de datos
- Formato de exportación documentado y estable.
- Versiones de esquema explícitas.
- Migraciones idempotentes y testeadas.

### RNF-06 · Accesibilidad
- WCAG 2.1 nivel AA.
- Soporte de lector de pantalla en todos los flujos principales.
- Contraste mínimo 4.5:1.
- Targets táctiles ≥ 44×44 px.

### RNF-07 · Internacionalización
- i18n preparada desde el inicio (al menos `es` y `en`).
- Formato de número/fecha localizados.

### RNF-08 · Seguridad local
- Opcional: cifrado del backup con contraseña (AES-GCM vía WebCrypto).
- Opcional: PIN/biometría (Web Authentication) para abrir la app.
- Bloqueo automático tras X minutos inactividad (configurable).

### RNF-09 · Mantenibilidad
- Cobertura de tests unitarios ≥ 60% en lógica de dominio.
- Tipado estricto (`strict: true` en tsconfig).
- CI local con lint + tests antes de cada commit (husky + lint-staged).

### RNF-10 · Resiliencia
- Si IndexedDB falla, la app debe mostrar error claro sin perder datos en memoria y permitir export inmediato.
- Operaciones críticas (movimientos, transferencias) en **transacciones atómicas**.
