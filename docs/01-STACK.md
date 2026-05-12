# 01 · Stack tecnológico

Criterios de elección: PWA móvil, offline-first, sin dependencia de servicios de pago, ecosistema maduro, bundle pequeño y buen DX.

## Resumen

| Capa | Elección | Alternativa considerada |
|------|----------|-------------------------|
| Lenguaje | **TypeScript 5** | JavaScript |
| Build / dev server | **Vite 5** | Webpack, Parcel |
| Framework UI | **React 18** | Svelte / SvelteKit, Vue 3 |
| Routing | **React Router 6** (modo data) | TanStack Router |
| Estado global | **Zustand** | Redux Toolkit, Jotai |
| Estilos | **Tailwind CSS 3** + **CSS variables** | UnoCSS, vanilla CSS |
| Componentes accesibles | **Radix UI** primitives | Headless UI, Ark UI |
| Iconos | **Lucide React** | Heroicons |
| Persistencia local | **Dexie.js** (wrapper de IndexedDB) | idb, idb-keyval, RxDB |
| Formularios | **React Hook Form** + **Zod** | Formik + Yup |
| PWA / SW | **vite-plugin-pwa** (Workbox) | Manual SW |
| Lectura de códigos | **@zxing/browser** | html5-qrcode |
| Generación QR | **qrcode** (npm) | qr-code-styling |
| Excel / CSV | **SheetJS (xlsx)** + **papaparse** | exceljs |
| Fechas | **date-fns** | Luxon, dayjs |
| Compresión backups | **pako** (gzip) | fflate |
| P2P sync (opcional) | **PeerJS** sobre WebRTC | simple-peer, libp2p |
| Tests unitarios | **Vitest** + **React Testing Library** | Jest |
| E2E (opcional) | **Playwright** | Cypress |
| Linter / formato | **ESLint** + **Prettier** | Biome |
| Gestor de paquetes | **pnpm** | npm, yarn |

## Justificación clave

### ¿Por qué React + Vite?
- Vite ofrece HMR muy rápido y construye bundles modernos por defecto.
- React es el ecosistema con más componentes accesibles y librerías PWA.
- Svelte produce bundles más pequeños pero el ecosistema móvil (lectores de códigos, SheetJS, etc.) está mejor integrado con React.

### ¿Por qué Dexie.js?
- IndexedDB es la única opción razonable para datos estructurados con volumen (>5 MB) en navegador.
- Dexie ofrece índices, transacciones, queries tipadas y un sistema de **migraciones por versión** crítico para una app que evolucionará su esquema.
- Soporta **Dexie Cloud** (de pago) pero no lo usaremos: nos quedamos con el core gratuito.

### ¿Por qué Zustand?
- API mínima, sin boilerplate.
- Soporta persistencia con middlewares (aunque la fuente de verdad será IndexedDB).
- Tamaño <1 KB gz.

### ¿Por qué vite-plugin-pwa?
- Genera manifest + service worker con Workbox.
- Estrategias de cache configurables.
- Soporta auto-update con UI propia.

### ¿Por qué PeerJS para sync opcional?
- WebRTC permite conexiones **peer-to-peer directas** entre dispositivos.
- Solo se necesita un servidor de **señalización** (signaling), que es ligerísimo y existe **gratis y público** en `0.peerjs.com`, o se puede autoalojar con `peer` (Node) en cualquier PC/VPS.
- **No transmite los datos a través del servidor** — solo intercambia metadatos de conexión. Los datos van directamente entre dispositivos.

## Restricciones autoimpuestas

- ❌ No usar Firebase, Supabase, Auth0, Vercel KV, Planetscale, etc. (servicios gestionados con tier de pago).
- ❌ No exigir cuenta de usuario en servicios de terceros para usar la app.
- ✅ Sí se permite **integración opcional** con servicios que el usuario ya tenga (Google Drive vía exportación manual de fichero, WebDAV/Nextcloud autoalojado, GitHub Gist con su PAT).

## Tamaño objetivo

- Bundle inicial JS: **< 200 KB gz**.
- First Contentful Paint en 3G: **< 2 s**.
- Time to Interactive en gama media (Moto G Power-like): **< 3 s**.

## Versiones mínimas de navegador

- Chrome / Edge 100+
- Safari iOS 16.4+ (requerido para PWA instalable + push)
- Firefox 110+
- Android WebView reciente
