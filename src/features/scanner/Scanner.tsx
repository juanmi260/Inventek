import { useEffect, useRef, useState } from 'react';
import { startScanner, hapticTap, type ScannerControls } from '@/platform/scanner';
import { Button } from '@/ui/Button';
import { Camera } from 'lucide-react';

export interface ScannerProps {
  onDetected: (code: string) => void;
  paused?: boolean;
  cooldownMs?: number;
}

interface ScannerError {
  short: string;
  detail?: string;
}

export function Scanner({ onDetected, paused, cooldownMs = 1500 }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const lastDetectedAt = useRef<number>(0);
  const lastCode = useRef<string>('');

  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<ScannerError | null>(null);

  const start = async () => {
    if (!videoRef.current || controlsRef.current || starting) return;
    setError(null);
    setStarting(true);
    try {
      const controls = await startScanner(
        videoRef.current,
        (text) => {
          if (pausedRef.current) return;
          const now = Date.now();
          if (text === lastCode.current && now - lastDetectedAt.current < cooldownMs) return;
          lastCode.current = text;
          lastDetectedAt.current = now;
          hapticTap();
          onDetectedRef.current(text);
        },
        {
          onStreamEnded: () => {
            controlsRef.current?.stop();
            controlsRef.current = null;
            setRunning(false);
            setError({
              short: 'iOS ha cortado la cámara.',
              detail:
                'Suele pasar en modo PWA. Prueba a abrir Inventek desde Safari (no como app instalada) o cierra otras apps que usen cámara.',
            });
          },
        },
      );
      controlsRef.current = controls;
      setRunning(true);
    } catch (e) {
      const err = e as DOMException & { message?: string; name?: string };
      const name = err?.name ?? '';
      const msg = err?.message ?? String(e);
      if (name === 'NotAllowedError' || /permission/i.test(msg)) {
        setError({
          short: 'Permiso de cámara denegado.',
          detail: 'Revisa Ajustes → Safari → Cámara.',
        });
      } else if (name === 'NotFoundError') {
        setError({ short: 'No se ha encontrado ninguna cámara.' });
      } else if (name === 'NotReadableError') {
        setError({
          short: 'La cámara no está disponible.',
          detail: 'Cierra otras apps que la usen (Cámara, FaceTime…) y reintenta.',
        });
      } else if (name === 'AbortError') {
        setError({ short: 'La cámara se ha interrumpido. Reintenta.' });
      } else if (name === 'OverconstrainedError') {
        setError({ short: 'La cámara no admite esa configuración.', detail: msg });
      } else {
        setError({ short: 'No se ha podido iniciar la cámara.', detail: `${name}: ${msg}` });
      }
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

  // Idle (before first tap): button-only overlay covers the video.
  // Starting / running: NO solid overlay — iOS needs the <video> visible
  // or it kills the stream silently.
  const showIdleOverlay = !running && !starting && !error;
  const showErrorOverlay = !!error;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />

      {running && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-48 w-72 max-w-[80vw]">
            <div className="absolute inset-0 rounded-lg border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            <div className="absolute left-0 right-0 top-1/2 h-px animate-pulse bg-primary" />
          </div>
        </div>
      )}

      {starting && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center">
          <span className="rounded bg-black/70 px-3 py-1.5 text-sm text-white shadow-card">
            Iniciando cámara…
          </span>
        </div>
      )}

      {showIdleOverlay && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black p-6 text-center">
          <Camera size={48} className="text-white/70" aria-hidden />
          <p className="max-w-xs text-sm text-white/80">
            Toca para activar la cámara. iOS requiere un toque explícito para que se inicie.
          </p>
          <Button onClick={() => void start()} size="lg">
            Iniciar cámara
          </Button>
        </div>
      )}

      {showErrorOverlay && error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black p-6 text-center">
          <p className="text-sm text-white">{error.short}</p>
          {error.detail && <p className="max-w-xs text-xs text-white/70">{error.detail}</p>}
          <Button
            variant="secondary"
            onClick={() => {
              setError(null);
              void start();
            }}
          >
            Reintentar
          </Button>
        </div>
      )}
    </div>
  );
}
