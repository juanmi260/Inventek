import { useCallback, useEffect, useRef, useState } from 'react';
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
  const controlsRef = useRef<ScannerControls | null>(null);
  const lastDetectedAt = useRef<number>(0);
  const lastCode = useRef<string>('');
  const [error, setError] = useState<ScannerError | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const launch = useCallback(async () => {
    setError(null);
    setNeedsTap(false);
    if (!videoRef.current) return;
    try {
      const controls = await startScanner(videoRef.current, (text) => {
        const now = Date.now();
        if (text === lastCode.current && now - lastDetectedAt.current < cooldownMs) return;
        lastCode.current = text;
        lastDetectedAt.current = now;
        hapticTap();
        onDetected(text);
      });
      controlsRef.current = controls;
    } catch (e) {
      const err = e as DOMException & { message?: string; name?: string };
      const name = err?.name ?? '';
      const msg = err?.message ?? String(e);
      if (name === 'NotAllowedError' || /permission/i.test(msg)) {
        setError({ short: 'Permiso de cámara denegado.', detail: 'Revisa Ajustes → Safari → Cámara.' });
      } else if (name === 'NotFoundError' || /notfound/i.test(msg)) {
        setError({ short: 'No se ha encontrado ninguna cámara.' });
      } else if (name === 'NotReadableError' || /notreadable|abort/i.test(msg)) {
        setError({ short: 'La cámara está siendo usada por otra app.' });
      } else if (name === 'OverconstrainedError') {
        setError({ short: 'La cámara no admite esa configuración.', detail: msg });
      } else if (/play|autoplay/i.test(msg)) {
        // Some iOS contexts need a user gesture to start playback.
        setNeedsTap(true);
      } else {
        setError({ short: 'No se ha podido iniciar la cámara.', detail: `${name}: ${msg}` });
      }
    }
  }, [onDetected, cooldownMs]);

  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    void (async () => {
      await launch();
      if (cancelled) {
        controlsRef.current?.stop();
        controlsRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [paused, launch, retryKey]);

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
          <Button onClick={() => void launch()}>Toca para activar la cámara</Button>
        </div>
      )}
    </div>
  );
}
