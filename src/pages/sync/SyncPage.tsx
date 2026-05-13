import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/ui/PageHeader';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { showToast } from '@/ui/Toast';
import { Sheet } from '@/ui/Sheet';
import { Scanner } from '@/features/scanner/Scanner';
import {
  connectToHost,
  startHost,
  type SyncEvent,
  type SyncSession,
} from '@/platform/p2pSync';
import { encodePeerPayload, parsePayload, renderQrDataUrl } from '@/platform/qr';
import { formatBytes } from '@/utils/format';
import {
  Smartphone,
  QrCode,
  ScanLine,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
} from 'lucide-react';

type Phase =
  | 'idle'
  | 'host-opening'
  | 'host-waiting'
  | 'guest-opening'
  | 'guest-connecting'
  | 'connected'
  | 'syncing'
  | 'done'
  | 'error';

interface Progress {
  sentBytes?: number;
  recvBytes?: number;
  recvCount?: number;
  otherDeviceId?: string;
  peerId?: string;
  errorMessage?: string;
}

export default function SyncPage() {
  const [params, setParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<Progress>({});
  const sessionRef = useRef<SyncSession | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [manualId, setManualId] = useState('');

  const reset = () => {
    sessionRef.current?.destroy();
    sessionRef.current = null;
    setPhase('idle');
    setProgress({});
    setQrUrl(null);
  };

  useEffect(() => {
    return () => sessionRef.current?.destroy();
  }, []);

  // Deep link: /sync?peer=<id> connects directly when arriving from a QR scan
  // in another page.
  useEffect(() => {
    const peer = params.get('peer');
    if (peer && phase === 'idle') {
      beGuest(peer);
      const next = new URLSearchParams(params);
      next.delete('peer');
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEvent = (e: SyncEvent) => {
    if (e.type === 'opening') return;
    if (e.type === 'peer-id') {
      setProgress((p) => ({ ...p, peerId: e.peerId }));
      void renderQrDataUrl(encodePeerPayload(e.peerId), { width: 280 }).then(setQrUrl);
      setPhase('host-waiting');
    } else if (e.type === 'connecting') {
      setPhase('guest-connecting');
    } else if (e.type === 'connected') {
      setProgress((p) => ({ ...p, otherDeviceId: e.otherDeviceId }));
      setPhase('connected');
    } else if (e.type === 'sent-snapshot') {
      setProgress((p) => ({ ...p, sentBytes: e.bytes }));
      setPhase('syncing');
    } else if (e.type === 'received-snapshot') {
      setProgress((p) => ({ ...p, recvBytes: e.bytes, recvCount: e.count }));
    } else if (e.type === 'done') {
      setPhase('done');
    } else if (e.type === 'error') {
      setProgress((p) => ({ ...p, errorMessage: e.message }));
      setPhase('error');
    }
  };

  const beHost = () => {
    reset();
    setPhase('host-opening');
    sessionRef.current = startHost(handleEvent);
  };

  const beGuest = (peerId: string) => {
    reset();
    setShowConnect(false);
    setShowQrScanner(false);
    setPhase('guest-opening');
    sessionRef.current = connectToHost(peerId, handleEvent);
  };

  return (
    <>
      <PageHeader title="Sincronizar" back="/more" />

      {phase === 'idle' ? (
        <div className="space-y-3 px-3">
          <p className="text-sm text-muted">
            Intercambia tu inventario directamente con otro dispositivo en la misma sesión.
            La conexión es P2P (WebRTC) y los datos no se almacenan en ningún servidor:
            solo se usa un broker público gratuito para descubrir al otro dispositivo.
          </p>
          <OptionCard
            icon={<QrCode size={24} />}
            title="Mostrar mi código"
            description="Muestra un QR para que otro dispositivo lo escanee y se conecte."
            onClick={beHost}
          />
          <OptionCard
            icon={<ScanLine size={24} />}
            title="Conectar a otro dispositivo"
            description="Escanea el QR del otro dispositivo o pega su código."
            onClick={() => setShowConnect(true)}
          />
          <p className="px-1 pt-2 text-xs text-muted">
            Ambas partes acabarán con la fusión de los inventarios. Antes de cualquier
            cambio, considera exportar un backup desde "Backup y restaurar".
          </p>
        </div>
      ) : (
        <SessionView
          phase={phase}
          progress={progress}
          qrUrl={qrUrl}
          onCancel={reset}
        />
      )}

      <Sheet
        open={showConnect}
        onOpenChange={(o) => !o && setShowConnect(false)}
        title="Conectar a otro dispositivo"
      >
        <div className="space-y-3">
          <Button
            className="w-full"
            iconStart={<ScanLine size={18} />}
            onClick={() => {
              setShowConnect(false);
              setShowQrScanner(true);
            }}
          >
            Escanear QR
          </Button>
          <div className="text-center text-xs text-muted">o pega el código manualmente</div>
          <Input
            label="Código del otro dispositivo"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="abc-def-…"
            autoFocus
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setShowConnect(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => beGuest(manualId.trim())}
              disabled={!manualId.trim()}
            >
              Conectar
            </Button>
          </div>
        </div>
      </Sheet>

      {showQrScanner && (
        <div className="fixed inset-0 z-40 bg-black">
          <div className="safe-top absolute inset-x-0 top-0 z-10 flex justify-between p-3">
            <Button variant="secondary" onClick={() => setShowQrScanner(false)}>
              Cerrar
            </Button>
          </div>
          <Scanner
            paused={false}
            onDetected={(text) => {
              const parsed = parsePayload(text);
              if (parsed.kind === 'peer') {
                beGuest(parsed.peerId);
              } else {
                showToast({
                  title: 'QR no reconocido',
                  description: 'Este QR no parece ser un código de sincronización.',
                  variant: 'warning',
                });
              }
            }}
          />
        </div>
      )}
    </>
  );
}

function OptionCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded border border-border bg-surface p-3 text-left hover:bg-surface2"
    >
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-xs text-muted">{description}</div>
      </div>
      <ChevronRight size={18} className="text-muted" />
    </button>
  );
}

function SessionView({
  phase,
  progress,
  qrUrl,
  onCancel,
}: {
  phase: Phase;
  progress: Progress;
  qrUrl: string | null;
  onCancel: () => void;
}) {
  const isLoading =
    phase === 'host-opening' ||
    phase === 'guest-opening' ||
    phase === 'guest-connecting' ||
    phase === 'syncing';

  return (
    <div className="space-y-3 px-3">
      <StatusBanner phase={phase} message={progress.errorMessage} />

      {phase === 'host-waiting' && progress.peerId && (
        <div className="rounded border border-border bg-surface p-4 text-center">
          {qrUrl && (
            <img
              src={qrUrl}
              alt="QR de conexión"
              className="mx-auto h-64 w-64 rounded bg-white p-2"
            />
          )}
          <p className="mt-3 text-sm text-muted">
            El otro dispositivo debe escanear este QR o introducir el código:
          </p>
          <div className="mt-2 flex items-center justify-center gap-1">
            <code className="break-all rounded bg-surface2 px-2 py-1 font-mono text-xs">
              {progress.peerId}
            </code>
            <button
              type="button"
              aria-label="Copiar"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(progress.peerId!);
                  showToast({ title: 'Copiado', variant: 'success', durationMs: 1500 });
                } catch {
                  // ignore
                }
              }}
              className="rounded p-1 text-muted hover:bg-surface2 hover:text-text"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>
      )}

      {phase === 'connected' || phase === 'syncing' || phase === 'done' ? (
        <div className="rounded border border-border bg-surface p-3">
          {progress.otherDeviceId && (
            <div className="flex items-center gap-2 text-sm">
              <Smartphone size={16} className="text-primary" />
              <span className="truncate font-mono">{progress.otherDeviceId}</span>
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <Stat label="Enviado" value={progress.sentBytes != null ? formatBytes(progress.sentBytes) : '—'} />
            <Stat label="Recibido" value={progress.recvBytes != null ? formatBytes(progress.recvBytes) : '—'} />
          </div>
          {progress.recvCount != null && phase === 'done' && (
            <div className="mt-2 text-xs text-muted">
              {progress.recvCount} registros aplicados del otro dispositivo.
            </div>
          )}
        </div>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant={phase === 'done' ? 'primary' : 'secondary'} onClick={onCancel}>
          {phase === 'done' ? 'Terminar' : 'Cancelar'}
        </Button>
      </div>

      {isLoading && (
        <p className="px-1 text-center text-xs text-muted">
          Esto puede tardar unos segundos según tu conexión y el tamaño de los datos.
        </p>
      )}
    </div>
  );
}

function StatusBanner({ phase, message }: { phase: Phase; message?: string }) {
  if (phase === 'error') {
    return (
      <div className="flex items-start gap-2 rounded border border-danger/40 bg-danger/5 p-3">
        <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-danger" />
        <div className="min-w-0 text-sm">
          <div className="font-medium">Error de sincronización</div>
          {message && <div className="break-words text-xs text-muted">{message}</div>}
        </div>
      </div>
    );
  }
  if (phase === 'done') {
    return (
      <div className="flex items-start gap-2 rounded border border-success/40 bg-success/5 p-3">
        <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-success" />
        <div className="min-w-0 text-sm">
          <div className="font-medium">Sincronización completada</div>
          <div className="text-xs text-muted">El stock se ha reconstruido a partir del histórico.</div>
        </div>
      </div>
    );
  }
  const labels: Record<Phase, string> = {
    idle: '',
    'host-opening': 'Abriendo canal en el broker…',
    'host-waiting': 'Esperando al otro dispositivo…',
    'guest-opening': 'Conectando al broker…',
    'guest-connecting': 'Conectando al otro dispositivo…',
    connected: 'Conectado. Intercambiando datos…',
    syncing: 'Sincronizando…',
    done: '',
    error: '',
  };
  if (!labels[phase]) return null;
  return (
    <div className="flex items-center gap-2 rounded border border-border bg-surface p-3 text-sm">
      <Loader2 size={16} className="animate-spin text-primary" />
      <span>{labels[phase]}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-surface2 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
