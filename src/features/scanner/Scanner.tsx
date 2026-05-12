import { useEffect, useRef, useState } from 'react';
import { startScanner, hapticTap } from '@/platform/scanner';
import { Button } from '@/ui/Button';

export interface ScannerProps {
  onDetected: (code: string) => void;
  paused?: boolean;
  cooldownMs?: number;
}

export function Scanner({ onDetected, paused, cooldownMs = 1500 }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastDetectedAt = useRef<number>(0);
  const lastCode = useRef<string>('');
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    setError(null);

    (async () => {
      try {
        if (!videoRef.current) return;
        const controls = await startScanner(videoRef.current, (text) => {
          const now = Date.now();
          if (text === lastCode.current && now - lastDetectedAt.current < cooldownMs) return;
          lastCode.current = text;
          lastDetectedAt.current = now;
          hapticTap();
          onDetected(text);
        });
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(
          msg.includes('NotAllowed') || msg.includes('Permission')
            ? 'Permiso de cámara denegado.'
            : msg.includes('NotFound')
              ? 'No se ha encontrado ninguna cámara.'
              : 'No se ha podido iniciar la cámara.',
        );
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [paused, onDetected, cooldownMs, retryKey]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <p className="text-sm text-danger">{error}</p>
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
    </div>
  );
}
