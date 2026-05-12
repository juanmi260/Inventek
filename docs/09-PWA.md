# 09 · PWA — Manifest, Service Worker, instalación, offline

## Manifest (`public/manifest.webmanifest`)

```json
{
  "name": "Inventek",
  "short_name": "Inventek",
  "description": "Control de inventario offline para uno o varios almacenes.",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0b0d10",
  "theme_color": "#0f766e",
  "lang": "es",
  "dir": "ltr",
  "categories": ["business", "productivity", "utilities"],
  "icons": [
    { "src": "/icons/icon-192.png",      "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png",      "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-mask-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-mask-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "Escanear",   "url": "/scan",   "icons": [{ "src": "/icons/scan-96.png",   "sizes": "96x96" }] },
    { "name": "Movimiento", "url": "/move",   "icons": [{ "src": "/icons/move-96.png",   "sizes": "96x96" }] },
    { "name": "Recuento",   "url": "/count",  "icons": [{ "src": "/icons/count-96.png",  "sizes": "96x96" }] }
  ],
  "screenshots": [
    { "src": "/screens/home-narrow.png",  "sizes": "412x915",  "type": "image/png", "form_factor": "narrow" },
    { "src": "/screens/home-wide.png",    "sizes": "1280x720", "type": "image/png", "form_factor": "wide" }
  ]
}
```

## Service Worker (vía vite-plugin-pwa + Workbox)

### Configuración (extracto de `vite.config.ts`)

```ts
VitePWA({
  registerType: 'prompt',           // mostramos un toast "actualizar disponible"
  injectRegister: 'auto',
  manifest: { /* ver arriba o referencia a manifest.webmanifest */ },
  workbox: {
    globPatterns: ['**/*.{js,css,html,woff2,svg,png,webp}'],
    navigateFallback: '/index.html',
    runtimeCaching: [
      // Iconos / imágenes locales
      {
        urlPattern: ({ request }) => request.destination === 'image',
        handler: 'CacheFirst',
        options: { cacheName: 'img', expiration: { maxEntries: 200, maxAgeSeconds: 60*60*24*60 } }
      },
      // Fuentes
      {
        urlPattern: ({ request }) => request.destination === 'font',
        handler: 'CacheFirst',
        options: { cacheName: 'fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60*60*24*365 } }
      }
    ]
  }
})
```

### Estrategias

- **App shell (HTML, JS, CSS, fuentes, iconos)**: precaching en build, `CacheFirst` en runtime.
- **`index.html`**: `NetworkFirst` con timeout de 3 s para detectar nuevas versiones.
- **Datos del usuario**: **nunca pasan por la cache HTTP**. Viven en IndexedDB.
- **Llamadas a brokers/sync remotos** (PeerJS, WebDAV): `NetworkOnly`. Si no hay red, error claro a UI.

### Actualizaciones

- Estrategia `registerType: 'prompt'`: cuando hay nuevo SW, la app dispara `onNeedRefresh` y muestra un toast "Hay una nueva versión — recargar".
- Antes de aplicar la actualización, se hace un **backup automático a OPFS**.

## Instalación

- Capturar `beforeinstallprompt` y mostrar un botón "Instalar app" en el dashboard la primera vez que el usuario tenga 3+ visitas.
- En iOS no hay `beforeinstallprompt`: mostrar instrucciones "Compartir → Añadir a pantalla de inicio".
- En desktop (Chrome/Edge), el banner nativo se conserva pero se complementa con CTA propio.

## Permisos requeridos

| Permiso | Cuándo | Cómo se pide |
|---------|--------|--------------|
| Cámara | Primer uso del escáner | `getUserMedia({ video: { facingMode: 'environment' } })` con UI previa explicativa |
| Storage persistente | Tras crear datos | `navigator.storage.persist()` con UI si se deniega |
| Notificaciones (opcional) | Al activar alertas de stock mínimo | `Notification.requestPermission()` solo si se activa |
| File System Access | Al exportar/importar | Sólo en la acción |

Todos se piden **en el contexto de la acción**, nunca al arrancar.

## Capacidades opcionales según soporte

| Feature | API | Soporte |
|---------|-----|---------|
| Compartir fichero exportado | Web Share API | Android Chrome ✅, iOS Safari ✅, desktop limitado |
| Guardar dónde quiera el usuario | File System Access | Chromium ✅, Safari/iOS ❌ (fallback) |
| Notificaciones locales | Notifications API | Android ✅, iOS 16.4+ ✅ (instalada) |
| Background Sync | BackgroundSync | Chromium ✅, otros ❌ (no crítico) |
| Vibración | Vibration API | Android ✅, iOS ❌ |
| Lock Screen Orientation | Screen Orientation | Variable |
| Wake Lock | Screen Wake Lock | Útil en recuentos largos, Chromium ✅ |

La app **degrada con elegancia** cuando una API no existe.

## Pre-vuelo PWA (Lighthouse)

Objetivos antes de cada release:

- Performance ≥ 90
- Accessibility ≥ 95
- Best Practices ≥ 95
- SEO ≥ 90 (no es crítico pero gratis)
- PWA ✅ instalable
- No errores en consola

## Detalles iOS específicos

- iOS no aplica `theme_color` al notch; usar `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`.
- En "Añadir a pantalla de inicio", iOS lanza la app con un splash generado de los iconos: incluir tamaños recomendados.
- `localStorage` y IndexedDB son ocasionalmente purgados si el sitio no se visita en ~7 días: por eso solicitamos `navigator.storage.persist()` lo antes posible.
- Cámara solo accesible en contexto seguro (HTTPS) y dentro de una interacción del usuario.

## Despliegue

- Cualquier hosting estático: **GitHub Pages**, **Cloudflare Pages**, **Netlify (tier gratis)**, **Vercel (tier gratis)**, o un servidor propio.
- Solo se sirve HTML/JS/CSS estático + manifest + SW.
- No hay backend. No hay base de datos. No hay coste recurrente.
