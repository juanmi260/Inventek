# Guía de usuario · Inventek

Inventek es una PWA para llevar el control de inventario de uno o varios
almacenes desde el móvil. Funciona 100% en el dispositivo y no requiere
ninguna cuenta. Esta guía cubre los flujos principales.

## 1. Instalar la app

### Android (Chrome / Edge)
1. Abre [https://juanmi260.github.io/Inventek/](https://juanmi260.github.io/Inventek/).
2. Verás un banner "Añadir a pantalla de inicio" o el icono de instalación
   en la barra de URL.
3. Aceptar. Aparecerá un icono de Inventek en tu lanzador.

### iPhone (Safari, iOS 16.4+)
1. Abre la URL anterior en **Safari**.
2. Toca el botón compartir (cuadrado con flecha).
3. "Añadir a pantalla de inicio".
4. Abre Inventek desde el icono nuevo. La primera vez puede tardar unos
   segundos en estar lista offline.

### Escritorio
1. Chrome o Edge muestran un icono de instalación en la barra de URL.
2. Pulsa "Instalar" y Inventek se abrirá como aplicación independiente.

## 2. Primer arranque

1. **Crea un almacén**. Sin almacén no puedes registrar stock.
   - "Crear almacén" desde el dashboard, o desde Más → Almacenes.
   - Código corto (CEN, NAV, etc.), nombre y opcionalmente color y dirección.
   - Si es el único, queda marcado como predeterminado automáticamente.
2. **Da de alta tus primeros productos**. Productos → "Nuevo".
   - SKU único, nombre, opcionalmente uno o varios códigos de barras.
   - Foto del producto (cámara o galería) — se comprime localmente.
   - Precios de coste y venta para que aparezcan en los reportes.

## 3. Operaciones del día a día

### Entrada de stock
- Dashboard → "Entrada", o desde la ficha del producto → "Entrada".
- Selecciona productos y cantidades. Motivo: compra, devolución de
  cliente, ajuste positivo o manual.
- Confirma → los niveles de stock se actualizan en una transacción atómica.

### Salida
- Igual que entrada con motivos venta, consumo, merma o manual.
- Si no permites stock negativo (por defecto), el sistema te lo bloqueará
  si la cantidad supera el stock actual.

### Transferencia entre almacenes
- Necesitas al menos dos almacenes.
- "Transferir" desde el dashboard, ficha del producto o "Nuevo movimiento".
- Indica origen y destino. Se generan automáticamente la salida y la
  entrada en una sola transacción: si una falla, falla todo.

### Escaneo rápido
- Toca el **botón central de la barra inferior** (Escanear).
- iOS exige un toque adicional para activar la cámara (la primera vez).
- Apunta al código de barras. Si lo reconoce, sale un sheet con stock
  actual y +/− para sumar o restar.
- Si no lo reconoce, opción de dar de alta con el código pre-rellenado.

### Cambiar de almacén activo
- En la barra superior, toca el chip del almacén.
- O usa el selector cuando hay más de uno.

## 4. Recuentos físicos

Más → Recuentos → "Nuevo recuento".

1. **Elige almacén y alcance**:
   - *Completo*: snapshot de todos los productos con stock en el almacén.
   - *Parcial*: empieza vacío; lo que escanees se irá añadiendo.
2. **Cuenta**. Hay dos pestañas:
   - **Lista**: ves esperado vs contado. Tap en una fila para editar
     manualmente. Filtros por estado (sin contar / contado / con diferencia).
   - **Escanear**: cámara permanente. Cada lectura suma +1. En la
     parte inferior aparece el último producto escaneado con +/− para
     afinar la cantidad. La pantalla no se duerme mientras escaneas
     (Wake Lock).
3. **Cierra el recuento**:
   - "Cerrar" arriba a la derecha → confirmación con cuántos productos
     generan ajuste.
   - Inventek crea los movimientos `count-adjust` necesarios (uno para
     diferencias positivas, otro para negativas).
   - Los productos no contados quedan **sin tocar**.
4. **Cancelar** descarta el recuento sin generar ajustes.

Si te interrumpen, el recuento queda abierto: hay un tile "Recuento en
curso" en el dashboard para volver donde lo dejaste.

## 5. Reportes

Más → Reportes.

- **Stock**: unidades totales y por almacén.
- **Valoración**: valor a coste y a venta, margen potencial y desglose
  por almacén. Usa los precios actuales de cada producto.

Botón "Exportar stock" para descargar CSV o XLSX.

## 6. Backup y restauración

Más → Backup / restaurar.

- **Exportar todo**: descarga un `.json.gz` con todos tus datos. Se
  puede compartir por AirDrop, Drive, email, etc.
- **Exportar cifrado…**: igual pero protegido con contraseña
  (AES-GCM 256, PBKDF2). Genera un `.inventek.enc`. Mínimo 6 caracteres.
- **Guardar copia en el dispositivo**: backup local que sobrevive a
  "Borrar todos los datos". Se mantienen los últimos 14.
- **Importar**: lee un fichero `.json[.gz|.enc]`. Antes de aplicar
  cambios se guarda un backup local automático. Dos modos:
  - *Fusionar*: combina con lo que ya tienes.
  - *Reemplazar TODO*: borra lo existente y aplica el fichero.

**Recomendación:** exporta a iCloud Drive / Google Drive periódicamente.
Los backups locales pueden perderse si el navegador desaloja los datos.

## 7. Sincronizar con otro dispositivo (P2P)

Más → Sincronizar con otro dispositivo.

Inventek mantiene una **bitácora de eventos** local con cada cambio que
haces (alta, edición, movimiento, recuento, ajuste de mínimos…). Al
sincronizar con otro dispositivo, **solo viajan los cambios nuevos**, no
todo el inventario; los movimientos llevan identificadores únicos (ULID)
y nunca se duplican aunque sincronices muchas veces.

### Primer emparejamiento

1. Dispositivo A: "Mostrar mi código". Aparece un QR.
2. Dispositivo B: "Conectar a otro dispositivo" → "Escanear QR" → enfoca
   el QR de A.
3. Ambos dispositivos se conectan **directamente** (WebRTC, cifrado por
   DTLS). Solo se usa un broker público gratuito (`0.peerjs.com`) para
   descubrirse; el inventario nunca pasa por él.
4. Intercambian deltas, reconstruyen el stock y registran la huella del
   estado para futuras promociones.

### Topología primario / réplica

Para más de dos dispositivos lo recomendable es **designar uno como
primario** (típicamente el que está más tiempo encendido — un PC, un
tablet de oficina). El resto serán réplicas que se conectan al primario
en cuanto abren la app.

- **Hacerme primario**: botón en /sync. Si tu copia local coincide con
  la huella del primario actual (mismo número y orden de eventos),
  puedes promoverte sin riesgo. Si no coincide, te avisará y tendrás
  que sincronizar primero.
- **Quién es el primario** es un dato sincronizado: en cuanto alguien se
  promociona, todas las réplicas reciben el cambio en el siguiente sync
  y redirigen sus reconexiones automáticamente.
- **Peer-id estable**: cada dispositivo tiene un identificador derivado
  de su `deviceId` (visible en Acerca de). Las réplicas recuerdan el del
  primario y reconectan **sin escanear QR** cada vez que abren la app.

### Auto-reconexión al abrir la app

Si tu dispositivo es **réplica** y conoce al primario, al desbloquear
la app intenta sincronizar una vez automáticamente. Si tu dispositivo
es **primario**, abre escucha en el broker para que las réplicas te
encuentren. El estado se ve en el **tile de sincronización del
dashboard**:

- 🟢 *Sincronizado con el primario* — todo al día.
- 🔄 *Sincronizando…* — intercambiando deltas ahora.
- 👑 *Eres el primario · escuchando* — esperando réplicas.
- 🔌 *Sin conexión con el primario* — el otro dispositivo no responde
  (probablemente no tiene la app abierta).

### Qué pasa si el primario no está disponible

- **Las escrituras locales siempre funcionan.** Tu réplica acepta
  movimientos, altas y recuentos como siempre. Los cambios quedan en
  la bitácora local esperando.
- En cuanto el primario vuelva online y abras la app de cualquiera de
  los dos, el delta sync los aplica en segundos.
- Si tienes prisa, puedes **sincronizar directamente con otra réplica**
  (la opción "Conectar a otro dispositivo" sigue disponible). Los datos
  acaban convergiendo igual.

### Propagación entre 3+ dispositivos

Los datos solo se propagan entre dispositivos que se conectan **en el
momento** en que se conectan. Si A sincroniza con B y luego con C, A
hace de puente y C recibe lo de B "rebotado", pero B no se entera de los
cambios de C hasta una nueva sincronización A↔B (o B↔C directa). Con la
topología en estrella, basta con que cada réplica sincronice con el
primario para que todo converja.

### Casos límite

- **El primario no aparece en mucho tiempo**: puedes promover una
  réplica forzando la promoción (el aviso te dirá que podrías perder
  cambios suyos si vuelve, pero los movimientos pendientes seguirán
  siendo válidos cuando se reencuentren).
- **Edición concurrente del mismo campo**: si dos dispositivos editan
  a la vez el mismo campo del mismo producto, gana el último (`updatedAt`
  más reciente). Para movimientos y operaciones aditivas (entradas,
  salidas, recuentos) **no hay conflicto** porque cada uno tiene su
  ULID único y se aplican todos.

## 8. Compartir un producto por QR

Ficha del producto → icono QR arriba a la derecha. Genera un QR que el
otro dispositivo puede escanear desde la pantalla "Escanear" para
importar el producto (sin imagen — solo SKU, nombre, códigos y precios).

## 9. Seguridad

Más → Seguridad.

- **PIN de apertura**: 4-6 dígitos. Al abrir la app o tras inactividad
  pide el PIN. El hash se guarda con PBKDF2-SHA-256 (200k iteraciones).
- **Bloqueo automático**: configurable (off / 1 / 5 / 15 / 30 / 60 min).
- **Bloquear al cerrar la app**: bloquea en cuanto pierdes foco de la
  pestaña.

> ⚠️ Si pierdes el PIN no se puede recuperar. Tendrías que borrar los
> datos o restaurar desde un backup cifrado con contraseña conocida.

## 10. Salud de los datos

Más → Salud de los datos.

- Espacio: cuánto ocupas y la cuota disponible.
- Persistencia: si el navegador puede o no desalojar tus datos.
- Último backup local: nombre, fecha y backend usado (OPFS o IndexedDB).
- **Revisar**: comprueba integridad. Si detecta líneas o niveles
  huérfanos o stock negativo, ofrece reconstruir desde el histórico.

## 11. Ajustes

Más → Ajustes.

- Tema (claro / oscuro / sistema).
- Moneda (EUR/USD/GBP/MXN/ARS/COP/CLP/BRL/CHF/JPY/CNY).
- Idioma / formato regional.
- Sonido y vibración al escanear.
- Permitir stock negativo (si vendes antes de registrar entradas).
- Activar almacenamiento persistente.
- Borrar todos los datos.

## 12. Datos donde viven

- **Inventario principal**: IndexedDB del navegador (base `inventek`).
- **Backups locales**: OPFS donde sea posible, IndexedDB
  (`inventek_backups`, separada) en iOS Safari.
- **Imágenes**: dentro del campo del producto, comprimidas a JPEG.
- **Settings**: parte en `localStorage` (deviceId, tema, locale),
  parte en IndexedDB.

Nada sale del dispositivo salvo que tú lo decidas explícitamente
(exportar, compartir por QR o sincronizar P2P).
