# Inventek

PWA móvil para el **control de inventario** de uno o varios almacenes.

🌐 **App en producción:** [juanmi260.github.io/Inventek](https://juanmi260.github.io/Inventek/)

- **100% local-first:** todos los datos viven en el dispositivo (IndexedDB). La app funciona completa sin conexión.
- **Sin servicios de pago:** la sincronización/compartición entre dispositivos se hace por mecanismos gratuitos: exportación de ficheros (JSON/CSV/XLSX), códigos QR y conexiones P2P (WebRTC) usando brokers gratuitos o autoalojados.
- **Privacidad por defecto:** nada sale del dispositivo salvo que el usuario lo decida explícitamente. Backups cifrables con AES-GCM 256, PIN de apertura con PBKDF2.
- **Instalable** desde el navegador como app nativa en Android/iOS/desktop.

## Instalación rápida

1. Abre [juanmi260.github.io/Inventek](https://juanmi260.github.io/Inventek/) en el navegador del móvil.
2. **Android (Chrome):** acepta el banner "Añadir a pantalla de inicio".
3. **iOS (Safari):** botón compartir → "Añadir a pantalla de inicio". Necesita Safari, no Chrome iOS.
4. **Desktop:** icono de instalar en la barra de URL de Chrome/Edge.

## Documentación

- 📘 [Guía de usuario](docs/USER_GUIDE.md) — flujos completos paso a paso.
- 📝 [Changelog](CHANGELOG.md) — histórico de versiones.

### Documentación de diseño

| # | Documento | Contenido |
|---|-----------|-----------|
| 01 | [Stack tecnológico](docs/01-STACK.md) | Tecnologías, librerías y justificación |
| 02 | [Requisitos](docs/02-REQUIREMENTS.md) | Funcionales y no funcionales |
| 03 | [Arquitectura](docs/03-ARCHITECTURE.md) | Capas, estructura de carpetas, patrones |
| 04 | [Modelo de datos](docs/04-DATA_MODEL.md) | Entidades y relaciones |
| 05 | [Almacenamiento local](docs/05-STORAGE.md) | IndexedDB, migraciones, backups |
| 06 | [Compartición / sync](docs/06-SHARING_SYNC.md) | Cómo compartir sin terceros de pago |
| 07 | [Features](docs/07-FEATURES.md) | Funcionalidades priorizadas |
| 08 | [UI / UX](docs/08-UI_UX.md) | Diseño móvil-first |
| 09 | [PWA](docs/09-PWA.md) | Manifest, service worker, offline, instalación |
| 10 | [Roadmap](docs/10-ROADMAP.md) | Fases completadas y backlog |

## Estado

**v1.1.0 — sincronización continua con primario/réplica.**

- Fases 0-6 completas + Fase 7 (sync delta con bitácora de eventos y
  topología primario/réplica con promoción en caliente).
- Bundle inicial ~120 KB gz (objetivo < 200 KB ✓).
- 31 tests unitarios.
- CI con lint + typecheck + tests en cada push y PR.
- Deploy automático a GitHub Pages tras merge a `main`.

## Desarrollo local

```bash
git clone https://github.com/juanmi260/Inventek.git
cd Inventek
npm install
npm run dev          # http://localhost:5173
npm test             # vitest
npm run lint
npm run typecheck
npm run build        # producción
```

## Filosofía del proyecto

1. **Privacidad por defecto.** Nada sale del dispositivo salvo que el usuario lo decida explícitamente.
2. **Sin lock-in.** Los datos se pueden exportar a formatos estándar (JSON, CSV, XLSX) en cualquier momento.
3. **Sin costes recurrentes.** Cero dependencias de servicios SaaS o backends gestionados de pago.
4. **Móvil primero.** Cada pantalla está pensada para uso con una mano y posibles lecturas con la cámara.

## Licencia

Sin licencia formal aún. El código es público en GitHub para inspección. Si quieres usarlo o forkearlo, abre un issue para acordar términos.
