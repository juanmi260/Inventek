import { PageHeader } from '@/ui/PageHeader';
import { getDeviceId } from '@/platform/device';
import { Heart, Github, ExternalLink } from 'lucide-react';

declare const __APP_VERSION__: string;

export default function AboutPage() {
  const deviceId = getDeviceId();

  return (
    <>
      <PageHeader title="Acerca de" back="/more" />
      <div className="space-y-3 px-3">
        <section className="rounded border border-border bg-surface p-4 text-center">
          <div className="text-2xl font-semibold">Inventek</div>
          <div className="mt-1 text-sm text-muted">Versión {__APP_VERSION__}</div>
          <p className="mt-3 text-sm text-muted">
            PWA local-first para control de inventario.
            <br />
            Tus datos viven solo en este dispositivo.
          </p>
        </section>

        <section className="rounded border border-border bg-surface p-3">
          <h2 className="text-sm font-semibold">Este dispositivo</h2>
          <p className="mt-1 break-all font-mono text-xs">{deviceId}</p>
          <p className="mt-1 text-xs text-muted">
            Identificador local autoasignado. Se usa solo para etiquetar la
            sincronización P2P.
          </p>
        </section>

        <section className="rounded border border-border bg-surface p-3">
          <h2 className="text-sm font-semibold">Recursos</h2>
          <ul className="mt-2 space-y-2 text-sm">
            <li>
              <a
                href="https://github.com/juanmi260/Inventek"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-primary"
              >
                <Github size={14} aria-hidden /> Código fuente en GitHub
                <ExternalLink size={12} aria-hidden />
              </a>
            </li>
            <li>
              <a
                href="https://github.com/juanmi260/Inventek/blob/main/docs/USER_GUIDE.md"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-primary"
              >
                Guía de usuario
                <ExternalLink size={12} aria-hidden />
              </a>
            </li>
            <li>
              <a
                href="https://github.com/juanmi260/Inventek/blob/main/CHANGELOG.md"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-primary"
              >
                Changelog
                <ExternalLink size={12} aria-hidden />
              </a>
            </li>
          </ul>
        </section>

        <section className="rounded border border-border bg-surface p-3">
          <h2 className="text-sm font-semibold">Tecnologías</h2>
          <p className="mt-1 text-sm text-muted">
            React, TypeScript, Vite, Dexie (IndexedDB), Tailwind, Radix UI,
            ZXing, PeerJS, SheetJS, WebCrypto, vite-plugin-pwa.
          </p>
        </section>

        <p className="flex items-center justify-center gap-1 pt-2 text-xs text-muted">
          Hecho con <Heart size={12} className="text-danger" aria-hidden /> sin servidores.
        </p>
      </div>
    </>
  );
}
