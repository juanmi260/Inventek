# 08 · UI / UX

## Principios

1. **Móvil primero, una mano.** Los botones principales viven en la mitad inferior de la pantalla.
2. **Cámara como entrada principal.** El escáner está a un toque desde cualquier pantalla operativa.
3. **Pocas pantallas, mucho contexto.** Sheets/drawers en vez de navegar a nuevas pantallas cuando se trata de acciones rápidas.
4. **Feedback inmediato.** Toast + vibración + sonido (configurables) tras cada operación.
5. **Sin sorpresas.** Acciones destructivas siempre con confirmación textual.
6. **Visible cuando estás offline.** Un indicador discreto recuerda que estás trabajando local.

## Layout general

```
┌──────────────────────────────────────┐
│  Top bar (almacén activo + buscar)   │
├──────────────────────────────────────┤
│                                      │
│           Contenido scrollable       │
│                                      │
├──────────────────────────────────────┤
│  FAB de escáner (centro)             │
├──────────────────────────────────────┤
│  Bottom nav (5 destinos máx.)        │
└──────────────────────────────────────┘
```

### Bottom navigation (5 destinos)

1. **Inicio** — dashboard con alertas y accesos rápidos.
2. **Productos** — catálogo.
3. **Escanear** — FAB central, pantalla de escáner permanente.
4. **Movimientos** — historial y nuevo movimiento.
5. **Más** — almacenes, reportes, ajustes, compartir, backup.

### Top bar

- Selector de **almacén activo** (cambia el contexto de stock/movimientos).
- Búsqueda global (SKU, nombre, barcode).
- Indicadores: offline ✓, sync activo (cuando lo haya), backup pendiente.

## Pantalla de escáner

- **Visor a pantalla completa** con guías visuales.
- Cuando reconoce un código:
  - Vibra (Haptics API) + sonido corto.
  - Aparece un **bottom sheet** con la ficha del producto y acciones rápidas: `+1`, `-1`, `cantidad…`, `transferir`, `editar`.
- Si no reconoce el producto:
  - Acción "Dar de alta con este código".
- Modo "escaneo continuo" para recuentos: cada lectura suma 1 y se reanuda sin cerrar el sheet.

## Producto: ficha

- Encabezado con imagen, nombre, SKU.
- Tabs:
  - **Stock** — niveles por almacén.
  - **Movimientos** — histórico filtrado.
  - **Detalles** — categoría, proveedor, precios, códigos.
- Acciones flotantes: nuevo movimiento (entrada/salida/transfer), editar.

## Movimientos

- Lista virtualizada (react-virtual o similar) para escalar a 100k+.
- Filtros chips: tipo, almacén, rango de fechas, motivo.
- Cada fila: icono del tipo + producto + cantidad + delta.
- Tap → detalle del movimiento; las líneas son inmutables. "Revertir" crea un movimiento opuesto.

## Recuento físico

- Pantalla full-screen "modo recuento" con escáner permanente y contador en grande.
- Lista lateral colapsable con productos esperados vs. contados.
- Al cerrar: pantalla resumen con diferencias y confirmación.

## Design tokens

Definidos como CSS variables, expuestos a Tailwind:

```css
:root {
  --bg:         #ffffff;
  --surface:    #f6f6f7;
  --text:       #0e0f12;
  --muted:      #6b7280;
  --primary:    #0f766e;   /* teal-700 */
  --primary-fg: #ffffff;
  --danger:     #b91c1c;
  --warning:    #b45309;
  --success:    #15803d;
  --border:     #e5e7eb;
  --radius:     12px;
  --shadow:     0 1px 2px rgba(0,0,0,.06), 0 1px 12px rgba(0,0,0,.06);
}

:root.dark {
  --bg:         #0b0d10;
  --surface:    #14171c;
  --text:       #f3f4f6;
  --muted:      #9ca3af;
  --primary:    #2dd4bf;   /* teal-400 */
  --primary-fg: #052e2b;
  --danger:     #f87171;
  --warning:    #fbbf24;
  --success:    #4ade80;
  --border:     #1f2937;
}
```

## Componentes base (src/ui)

- `Button` — primario, secundario, ghost, destructivo. Soporta loading.
- `IconButton` — accesible (`aria-label` requerido).
- `Input`, `Select`, `Textarea` — con label asociado y mensajes de error.
- `Sheet` (bottom sheet) y `Dialog` (modal) sobre Radix.
- `Toast`.
- `Table` con virtualización.
- `EmptyState`.
- `Scanner`.

## Accesibilidad (AA)

- Targets táctiles ≥ 44×44 px.
- Contraste ≥ 4.5:1 en texto.
- Foco visible y orden de tabulación lógico.
- Anuncios ARIA-live para toasts y para resultados de escaneo.
- Soporte completo de teclado en desktop.
- Modo "texto grande": multiplica las escalas tipográficas por 1.25.

## i18n

- Diccionarios JSON por idioma en `src/i18n/{es,en}.json`.
- Formatos con `Intl.NumberFormat` y `Intl.DateTimeFormat` según `navigator.language` y override en ajustes.
- Las cadenas siempre por clave, nunca hardcoded en componentes.

## Errores en UI

- Banner persistente si IndexedDB no está disponible (ej: modo privado iOS) con instrucciones.
- `ErrorBoundary` envuelve la app y ofrece "Exportar datos" antes de cualquier otra acción.

## Microinteracciones

- Transición de sheet 200 ms ease-out.
- Vibración corta (15 ms) en escaneo correcto, doble (30+30) en error.
- Skeleton loaders < 150 ms (no parpadear; no mostrar si tarda menos).
