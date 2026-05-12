# 07 · Features (priorizadas)

Leyenda:
- **P0**: indispensable para que la app sea útil. Va en el MVP.
- **P1**: importante para que la app sea adoptable en producción.
- **P2**: deseable; aporta valor pero puede esperar.
- **P3**: explorar más adelante.

## P0 — MVP

### Catálogo
- [ ] Alta/edición/baja de productos.
- [ ] Búsqueda por nombre, SKU, código de barras.
- [ ] Escaneo de código de barras con cámara para localizar/dar de alta.
- [ ] Categorías simples (lista plana).

### Almacenes
- [ ] Alta/edición de almacenes.
- [ ] Almacén por defecto.

### Stock y movimientos
- [ ] Vista de stock por almacén con búsqueda y filtro.
- [ ] Entrada de stock (con cantidad, motivo, nota).
- [ ] Salida de stock.
- [ ] Transferencia entre almacenes (atómica).
- [ ] Ajuste manual con motivo obligatorio.
- [ ] Histórico de movimientos filtrable.

### Operación móvil
- [ ] PWA instalable.
- [ ] Funciona 100% offline tras la primera carga.
- [ ] Lectura de cámara fiable en Android e iOS.

### Datos
- [ ] Exportar todo a JSON.
- [ ] Importar desde JSON (fusionar o reemplazar).
- [ ] Auto-backup local (OPFS) diario.

### Ajustes
- [ ] Idioma es/en.
- [ ] Tema claro/oscuro.
- [ ] Moneda y formato numérico.

---

## P1 — Versión 1.0

### Catálogo extendido
- [ ] Múltiples códigos de barras por producto.
- [ ] Imagen del producto desde cámara o galería.
- [ ] Categorías jerárquicas.
- [ ] Proveedores.
- [ ] Etiquetas libres.

### Stock avanzado
- [ ] Stock mínimo / máximo por producto-almacén.
- [ ] Lista de "bajo mínimo" en dashboard.
- [ ] Ubicación interna (pasillo/estante) en el `StockLevel`.
- [ ] Permitir o no stock negativo (config).

### Recuentos físicos
- [ ] Crear un recuento (total o por categoría/lista).
- [ ] Modo escaneo continuo: cada lectura +1 al producto.
- [ ] Pausar / reanudar.
- [ ] Cierre que genera movimiento de ajuste automático con diff.

### Compartición
- [ ] Exportar CSV / XLSX.
- [ ] Importar catálogo desde CSV con mapeo.
- [ ] Generar y leer QR para "intercambio rápido" (producto, transferencia).
- [ ] Sync P2P por WebRTC entre dos dispositivos.

### Reportes
- [ ] Stock consolidado entre almacenes.
- [ ] Valoración de stock a coste y a venta.
- [ ] Histórico exportable.

### Seguridad
- [ ] PIN de apertura.
- [ ] Backup cifrado con contraseña.

### Usabilidad
- [ ] Modo "operación rápida": pantalla grande con escáner permanente y +/-.
- [ ] Sonido / vibración al escanear.
- [ ] Atajos a almacén activo.

---

## P2 — Versión 1.1+

- [ ] Etiquetas imprimibles con QR (web→print).
- [ ] Plantillas de movimientos recurrentes.
- [ ] Modo "kit / bundle" (un producto compuesto descuenta varios).
- [ ] Caducidades y lotes.
- [ ] Soporte multi-usuario local con trazabilidad.
- [ ] Histórico de precios (coste y venta).
- [ ] Importación de imágenes en lote.
- [ ] WebDAV / Nextcloud opcional.
- [ ] GitHub Gist opcional para versionar el catálogo.
- [ ] Soporte de báscula Bluetooth (lectura de peso, donde el navegador lo permita).

---

## P3 — Explorar

- [ ] CRDTs reales (Yjs / Automerge) para sync sin conflictos.
- [ ] Modo "tienda" con punto de venta básico.
- [ ] Generación de albaranes/recibos PDF.
- [ ] Integración con impresoras térmicas Bluetooth.
- [ ] OCR de facturas para entrada de stock asistida.
- [ ] Soporte de varios "tenants" / empresas en el mismo dispositivo.
- [ ] App de escritorio empaquetada con Tauri compartiendo el mismo código.
