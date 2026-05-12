# Inventek

PWA móvil para el **control de inventario** de uno o varios almacenes.

- **100% local-first:** todos los datos viven en el dispositivo (IndexedDB). La app funciona completa sin conexión.
- **Sin servicios de pago:** la sincronización/compartición entre dispositivos se hace por mecanismos gratuitos: exportación de ficheros (JSON/CSV/XLSX), códigos QR y conexiones P2P (WebRTC) usando brokers gratuitos o autoalojados.
- **Instalable** desde el navegador como app nativa en Android/iOS/desktop.

## Documentación

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
| 10 | [Roadmap](docs/10-ROADMAP.md) | Fases y MVP |

## Estado

Fase de diseño/documentación. Aún sin código.

## Filosofía del proyecto

1. **Privacidad por defecto.** Nada sale del dispositivo salvo que el usuario lo decida explícitamente.
2. **Sin lock-in.** Los datos se pueden exportar a formatos estándar (JSON, CSV, XLSX) en cualquier momento.
3. **Sin costes recurrentes.** Cero dependencias de servicios SaaS o backends gestionados de pago.
4. **Móvil primero.** Cada pantalla está pensada para uso con una mano y posibles lecturas con la cámara.
