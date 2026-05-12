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

### Protocolo de sync (CRDT-light)

Cada dispositivo mantiene una bitácora `syncEvents` por entidad:

```
{ id: ULID, deviceId, entity, entityId, op, payload, occurredAt }
```

Al sincronizar:
1. **Handshake**: ambos intercambian su `deviceId` y "vector de versiones" (`lastSeenULID` por cada `deviceId` conocido).
2. **Replay**: cada lado envía solo los eventos que el otro no tiene.
3. **Aplicación**: cada evento es idempotente (op `upsert` por `entityId` o `delete`). Conflicto se resuelve con **last-write-wins por `occurredAt`** (timestamps en ULID + clock skew compensado por `deviceId`).
4. **Compactación**: tras aplicar, se puede compactar la bitácora local (mantener solo último estado de cada entidad).

> Esto **no** es un CRDT completo, pero es robusto para inventarios donde las ediciones simultáneas del mismo producto son raras. Las cantidades de stock se sincronizan por **eventos de movimiento** (que son inmutables y aditivos), no por el `quantity` final.

### Privacidad

- Cada sesión P2P se aprueba manualmente en ambos lados (no hay descubrimiento automático).
- Opcionalmente, se cifra el payload sobre WebRTC con una clave derivada de un PIN compartido (PAKE simplificado).

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
