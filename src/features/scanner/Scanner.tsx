import { useEffect, useRef, useState } from 'react';
import { startScanner, hapticTap, type ScannerControls } from '@/platform/scanner';
import { Button } from '@/ui/Button';

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
  const lastDetectedAt = useRef<number>(0);
  const lastCode = useRef<string>('');
  // Keep latest callback in a ref so changes in the parent's callback
  // identity don't retrigger this effect (re-acquiring the camera too
  // fast on iOS results in NotReadableError).
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [error, setError] = useState<ScannerError | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    let controls: ScannerControls | null = null;
    setError(null);
    setNeedsTap(false);

    void (async () => {
      if (!videoRef.current) return;
      try {
        controls = await startScanner(videoRef.current, (text) => {
          const now = Date.now();
          if (text === lastCode.current && now - lastDetectedAt.current < cooldownMs) return;
          lastCode.current = text;
          lastDetectedAt.current = now;
          hapticTap();
          onDetectedRef.current(text);
        });
        if (cancelled) {
          controls.stop();
          controls = null;
        }
      } catch (e) {
        if (cancelled) return;
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
            detail:
              'Cierra otras apps que la usen (Cámara, FaceTime, otras pestañas) y reintenta.',
          });
        } else if (name === 'AbortError') {
          setError({ short: 'La cámara se ha interrumpido. Reintenta.' });
        } else if (name === 'OverconstrainedError') {
          setError({ short: 'La cámara no admite esa configuración.', detail: msg });
        } else if (/play|autoplay/i.test(msg)) {
          setNeedsTap(true);
        } else {
          setError({ short: 'No se ha podido iniciar la cámara.', detail: `${name}: ${msg}` });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (controls) {
        controls.stop();
        controls = null;
      }
    };
    // Intentionally only re-run on these. onDetected lives in a ref above.
  }, [paused, cooldownMs, retryKey]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-white">{error.short}</p>
        {error.detail && <p className="text-xs text-white/70">{error.detail}</p>}
        <Button variant="secondary" onClick={() => setRetryKey((k) => k + 1)}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-48 w-72 max-w-[80vw]">
          <div className="absolute inset-0 rounded-lg border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          <div className="absolute left-0 right-0 top-1/2 h-px animate-pulse bg-primary" />
        </div>
      </div>
      {needsTap && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <Button onClick={() => setRetryKey((k) => k + 1)}>
            Toca para activar la cámara
          </Button>
        </div>
      )}
    </div>
  );
}
