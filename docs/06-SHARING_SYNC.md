# 06 · Compartición y sincronización (sin terceros de pago)

> Principio: **el usuario decide cuándo, qué y cómo**. La app nunca sube datos a internet por defecto.

Soporte de varios mecanismos. El usuario elige el que mejor se adapte a su caso.

| Mecanismo | Caso de uso | Coste | Dependencias externas |
|-----------|-------------|-------|-----------------------|
| Export/import de fichero | Migración, backup, envío manual | 0 € | Ninguna |
| QR code | Compartir 1 producto / un movimiento / una orden | 0 € | Ninguna |
| Sync P2P WebRTC (PeerJS) | Dos dispositivos en directo | 0 € | Broker de señalización (público gratuito o autoalojado) |
| LAN sync | Misma red local | 0 € | Ninguna (mDNS + WebRTC local) |
| WebDAV / Nextcloud propio | Sync asíncrona vía carpeta | 0 € si autoalojado | Servidor del usuario |
| Git / GitHub Gist | Versionado del catálogo | 0 € (tier gratuito de GitHub) | Cuenta del usuario |
| Email / Web Share API | Envío puntual de fichero | 0 € | Apps del propio dispositivo |

## 1. Export / import de fichero

Ya descrito en [05-STORAGE.md](05-STORAGE.md). Es el **mecanismo base** y siempre estará disponible.

Casos:
- **Backup completo** → `.inventek.json` (o `.gz` / `.enc`).
- **Catálogo de productos** → CSV / XLSX.
- **Movimientos en un rango** → CSV / XLSX.

Importación:
- Detección automática del formato.
- Vista previa con diff (cuántos productos nuevos, cuántos modificados, cuántos eliminados).
- Modos: **fusionar** (por SKU/ULID) o **reemplazar todo**.

## 2. QR code para fragmentos

Los QR aguantan ~2 953 bytes de datos binarios con corrección baja. Aplicaciones:

- **Compartir un producto** entre dispositivos en segundos: el dispositivo A genera un QR, el B lo escanea y lo da de alta.
- **Compartir una transferencia pendiente**: A genera la orden de transferencia, B la recibe escaneando y al confirmar registra la entrada.
- **"Tarjeta" del producto**: imprimir QR con SKU + datos básicos para etiquetado físico.

Formato del payload (siempre prefijado para detección):

```
INVK1:<base64url(gzip(json))>
```

Si el payload supera la capacidad de un QR, se parte en varios QR numerados (`1/3`, `2/3`, `3/3`) y la app de destino los reagrupa.

## 3. Sync P2P por WebRTC (PeerJS)

### Idea

Dos dispositivos abren la app, eligen "Sync directo", uno muestra un código y el otro lo introduce (o escanea). Se establece un canal de datos **directo entre los dos navegadores** y la app intercambia los `SyncEvent`s que cada uno tiene desde el último sync.

### Componentes

- **DataChannel WebRTC** lleva los datos. Cifrado por defecto (DTLS).
- **Servidor de señalización** (signaling) **no transporta datos del usuario**: solo intercambia "ofertas" SDP e ICE candidates entre los dos pares. Es ligero.

### Servidores de señalización

1. **Broker público gratuito** de PeerJS (`0.peerjs.com`). Es el default — funciona sin configuración pero depende de un servicio externo (gratuito, sin cuenta).
2. **Autoalojado**: cualquier PC, Raspberry Pi o VPS corriendo `npx peer --port 9000`. La app lo permite configurar en ajustes.
3. **Conexión LAN** sin broker: si los dispositivos están en la misma red, se puede establecer la conexión con un intercambio QR del SDP (ICE local). Más manual pero **sin terceros**.

### Bitácora local de eventos

Cada dispositivo mantiene una tabla `syncEvents` poblada **dentro de la misma transacción** que cada mutación de dominio:

```
{ id: ULID monotónico, deviceId, entity, entityId, op: 'upsert', payload, occurredAt: ISO }
```

Entidades sincronizables y qué viaja:

| Entidad | Payload | Notas |
|---|---|---|
| `product` | entidad completa con `imageBlob` codificado base64 | LWW por `updatedAt`. |
| `warehouse` | entidad completa | LWW por `updatedAt`. |
| `movement` | `{ movement, lines }` | Inmutable: si el id ya existe localmente, se ignora. |
| `stockLevelLimits` | `{ warehouseId, productId, minStock, maxStock, location, updatedAt }` | **No incluye `quantity`** — eso se recompone. |
| `stockCount` | entidad completa | LWW por `updatedAt`. |
| `setting` | `{ key, value, updatedAt }` | Solo keys que sean compartidas (p. ej. `sync.primary`). |

Lo que **no** se sincroniza:
- `stockLevels.quantity` — derivado de movimientos; se recomputa con `rebuildStockLevels` tras aplicar un batch que contenga eventos `movement`.
- Settings locales como `inventek.theme`, `inventek.deviceId` o los watermarks.

### Protocolo delta sync

Implementado en `src/platform/p2pSync.ts`. Mensajes JSON sobre `DataConnection`:

1. **`hello`** (ambos lados al abrir):
   ```
   { type: 'hello', deviceId, appVersion, watermarks, fingerprint }
   ```
   `watermarks: Record<deviceId, lastEventId>` indica hasta dónde he visto eventos de cada autor. `fingerprint` es `{ watermarks, eventCount }` para validar promociones de primario.

2. **`events`** (cada lado, en lotes de ≤ 200):
   ```
   { type: 'events', events: SyncEvent[], done: boolean }
   ```
   El emisor calcula `eventsNewerThan(peer.watermarks)` y los manda. La bandera `done: true` en el último batch cierra la fase de envío.

3. **`ack`** (al terminar de recibir todo):
   ```
   { type: 'ack', applied: number }
   ```
   Cuando uno ha terminado de mandar y el otro le ha hecho ack, ambos saben que la sesión terminó.

4. **Al cerrar**: si se aplicó al menos un evento de tipo `movement`, se ejecuta `rebuildStockLevels` en cada extremo para que `stockLevels.quantity` quede coherente. Se graba el `sync.lastSyncAt` y se guarda la huella del peer en `sync.primaryFingerprint` (si era una sync con el primario o desde el primario) para futuras validaciones de promoción.

### Aplicación idempotente

`applyEvents(events)`:

1. Filtra los eventos cuyo `id` ya está en la bitácora local.
2. Abre una única transacción `rw` sobre todas las tablas afectadas + `syncEvents`.
3. Para cada evento:
   - Resuelve LWW comparando `updatedAt` local vs el del payload (gana el más reciente).
   - Para `movement`: si ya existe el id, no se toca (son inmutables). Si no, se inserta el movement y todas sus lines.
   - Persiste el `SyncEvent` original en la bitácora local con su `id` y `deviceId` originales, para que la próxima réplica que sincronice tampoco lo duplique.
4. Avanza los watermarks locales por cada `deviceId` que apareció en el batch.

### Topología primario / réplica

Setting compartido (entidad `setting`, key `sync.primary`):

```
{ peerId, deviceId, updatedAt }
```

- `peerId` es **estable y derivable** desde el `deviceId` del primario (`inventek-<deviceIdSinSeparadores>`), así que las réplicas pueden reconectar sin volver a escanear QR.
- El cambio de primario se hace con `setSelfAsPrimary()`, que emite un `SyncEvent` de `setting`. En el siguiente sync con cualquier réplica, esa réplica aprende quién es el nuevo primario y al reabrir la app se conectará a él en vez de al antiguo.

**Promoción segura** (`canPromoteSelf()`):

1. Lee la huella del primario actual (la que se guardó la última vez que sincronizamos con/desde él).
2. Compara con la huella local. Coinciden ⇔ `eventCount` y `watermarks` por deviceId iguales.
3. Si coinciden, el botón "Hacerme primario" está habilitado sin advertencia.
4. Si no coinciden, ofrece "sincronizar primero". Si el primario está caído, se puede forzar la promoción asumiendo el aviso de "podrías perder cambios suyos si reaparece".

**Autoreconexión** (en `SyncProvider`, al desbloquear la app):

- Si el `sync.primary.deviceId` es el mío → soy primario → abro `startHost` con mi peer-id estable.
- Si no → soy réplica → llamo `connectToHost(primary.peerId)` una vez.

**Auto-sync debounced bidireccional** (Fase 7.2 + 7.3):

Tras la primera conexión, la sesión se cierra. Para que cambios posteriores se propaguen sin pulsar nada, hay un hook Dexie sobre `syncEvents` que detecta inserciones con `deviceId === local` (descarta eventos aplicados desde un remoto) y programa una sincronización 2 segundos después. El temporizador se reinicia con cada nuevo evento, así que una ráfaga (p. ej. una entrada con varias líneas) genera un único sync al final.

Si una sincronización ya está en marcha (`phase` ∈ {opening, connecting, connected, syncing}), el temporizador no dispara — se respeta la que esté en curso y el siguiente cambio reintentará.

**Peer persistente y push del primario** (Fase 7.3):

Cada dispositivo abre su Peer (PeerJS) con su peer-id estable (`inventek-<deviceId>`) **al lanzar la app y lo mantiene vivo** hasta que se cierra. El mismo Peer sirve tanto para iniciar conexiones (pull desde una réplica al primario) como para aceptarlas (push del primario a una réplica).

- Cuando una réplica conecta al primario, el primario aprende su `deviceId` (en el `hello`) y su `peerId` (en `conn.peer`). Lo persiste en `sync.knownReplicas` (lista de `{ deviceId, peerId, lastSeenAt }`). Entradas más antiguas de 30 días se descartan al leer.
- Cuando el primario hace un cambio local, el debounce dispara `syncWithPrimary` → detecta `isPrimary` → itera `getKnownReplicas` y llama `peer.connect(replica.peerId)` **secuencialmente**, ejecutando el mismo protocolo de delta sync.
- Si una réplica está offline, el primario recibe `peer-unavailable` y pasa a la siguiente. No bloquea. Esa réplica recibirá los cambios al volver a conectar (auto-pair o auto-sync).

La autoreconexión al broker (`peer.on('disconnected') → peer.reconnect()`) se mantiene; si la WebSocket cae, el Peer la restaura sin perder su id estable.

### Convergencia con 3+ dispositivos

Los eventos solo viajan entre pares conectados, **en el momento** en que se conectan. Con topología en estrella (todas las réplicas sincronizan con el primario) todo el grupo converge tras una ronda de syncs réplica↔primario.

Si A y B sincronizan, luego A y C, entonces C recibe lo de B "rebotado" por A, pero B aún no sabe de C hasta una nueva sync A↔B (o B↔C directa). En la práctica esto se resuelve solo gracias a la autoreconexión.

### Privacidad

- Cada sesión P2P se aprueba implícitamente al escanear el QR del peer-id o al estar configurada la autoreconexión al primario.
- Los datos viajan cifrados por DTLS (default WebRTC). El broker de PeerJS nunca ve el contenido — solo los descriptores SDP/ICE.

## 4. WebDAV / Nextcloud propio (opcional)

Para usuarios que ya tienen un Nextcloud o un servidor WebDAV:

- La app guarda el último backup en una carpeta vía cliente WebDAV.
- Configuración: URL, usuario, contraseña-app (no la principal).
- Las contraseñas se guardan **cifradas** con WebCrypto y una passphrase local opcional.

No hay coste porque el servidor es del usuario.

## 5. Git / GitHub Gist (opcional, avanzado)

Para llevar versionado del catálogo de productos:
- El usuario pega un Personal Access Token con permiso `gist`.
- La app push/pull a un gist privado. El gist contiene el JSON.
- Permite ver el histórico de cambios desde la propia web de GitHub.

Gratuito. Recomendado solo para usuarios técnicos.

## 6. Email / Web Share API

Botón "Compartir" en cualquier export:
```ts
if (navigator.share) {
  await navigator.share({ files: [file], title: 'Backup Inventek' });
}
```
Esto invoca el menú nativo del sistema y permite enviarlo por la app que el usuario prefiera (Telegram, Mail, AirDrop, Nearby Share, etc.) sin que Inventek tenga que integrarse con ninguna.

## Tabla de decisión rápida

| Quiero… | Mecanismo recomendado |
|---------|-----------------------|
| Mover toda mi BBDD a otro móvil una sola vez | Export → Share/AirDrop → Import |
| Trabajar 2 personas en el mismo inventario a diario | Sync P2P WebRTC al final del día |
| Que el supervisor reciba el conteo de hoy | Export filtrado + Share |
| Pasar un producto del catálogo a un compañero | QR code |
| Tener backup en mi NAS | WebDAV opcional |
| Tener histórico versionado de catálogo | Git/Gist opcional |

## Lo que NO hacemos

- ❌ Servidor central propio "porque sí".
- ❌ Cuentas de usuario obligatorias.
- ❌ Sync automático en segundo plano contra un SaaS.
- ❌ Telemetría.

Todo lo "online" es **opt-in** y, cuando es posible, **bring-your-own-backend**.
