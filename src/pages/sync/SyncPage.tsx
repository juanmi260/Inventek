import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/ui/PageHeader';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { showToast } from '@/ui/Toast';
import { Sheet } from '@/ui/Sheet';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Scanner } from '@/features/scanner/Scanner';
import { useSync } from '@/state/sync';
import { encodePeerPayload, parsePayload, renderQrDataUrl } from '@/platform/qr';
import {
  canPromoteSelf,
  setSelfAsPrimary,
} from '@/domain/use-cases/primary';
import { formatDate } from '@/utils/format';
import {
  QrCode,
  ScanLine,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Crown,
  Smartphone,
  RefreshCw,
} from 'lucide-react';

export default function SyncPage() {
  const [params, setParams] = useSearchParams();
  const sync = useSync();
  const [showConnect, setShowConnect] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [manualId, setManualId] = useState('');
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promotionState, setPromotionState] = useState<string>('');

  // Refresh primary info on mount.
  useEffect(() => {
    void sync.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render QR for the local peer-id (visible whenever the listener is ready,
  // not only during a host session). The Peer is persistent now, so the QR
  // is meaningful at any time.
  useEffect(() => {
    const pid = sync.myPeerId ?? sync.progress.peerId;
    if (pid) {
      void renderQrDataUrl(encodePeerPayload(pid), { width: 280 }).then(setQrUrl);
    } else {
      setQrUrl(null);
    }
  }, [sync.myPeerId, sync.progress.peerId]);

  // Deep link ?peer=... connects directly.
  useEffect(() => {
    const peer = params.get('peer');
    if (peer && sync.progress.phase === 'idle') {
      sync.connect(peer);
      const next = new URLSearchParams(params);
      next.delete('peer');
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tryPromote = async () => {
    const check = await canPromoteSelf();
    if (!check.ok) {
      const map: Record<string, string> = {
        'no-primary': 'Aún no hay primario. Eres el primero — al hacerte primario las réplicas se conectarán a ti.',
        'is-already-primary': 'Ya eres el primario.',
        mismatch: check.reason === 'mismatch' ? (check.details ?? '') : '',
        unknown: check.reason === 'unknown' ? (check.details ?? '') : '',
      };
      setPromotionState(map[check.reason] ?? '');
      if (check.reason === 'no-primary' || check.reason === 'is-already-primary') {
        // No-primary case is actually ok — we can proceed to set ourselves.
        if (check.reason === 'no-primary') {
          setPromoteOpen(true);
          return;
        }
        showToast({ title: map[check.reason] ?? 'No se puede promover', variant: 'warning' });
        return;
      }
      setPromoteOpen(true);
      return;
    }
    setPromotionState('Tu copia local está al día. Puedes hacerte primario sin perder datos.');
    setPromoteOpen(true);
  };

  const doPromote = async () => {
    const info = await setSelfAsPrimary();
    await sync.refresh();
    // The persistent Peer was already created with our stable peer-id at app
    // open — promotion only flips the role; no Peer restart is needed.
    showToast({ title: 'Eres el primario', description: info.peerId, variant: 'success' });
    setPromoteOpen(false);
  };

  return (
    <>
      <PageHeader title="Sincronizar" back="/more" />

      <div className="space-y-3 px-3">
        <PrimaryStatusCard />

        {/* SessionView shows the banner + stats whenever there's something to
            report (anything other than fully idle). */}
        {sync.progress.phase !== 'idle' && <SessionView qrUrl={qrUrl} />}

        {/* Action options always available except during an in-flight sync. */}
        {sync.progress.phase !== 'opening' &&
          sync.progress.phase !== 'connecting' &&
          sync.progress.phase !== 'connected' &&
          sync.progress.phase !== 'syncing' && (
            <>
              {sync.primary && sync.primary.deviceId !== getDeviceIdSafe() && (
                <OptionCard
                  icon={<RefreshCw size={24} />}
                  title="Sincronizar ahora con el primario"
                  description={`Reconecta con ${sync.primary.peerId}.`}
                  onClick={() => sync.connect(sync.primary!.peerId)}
                />
              )}
              <OptionCard
                icon={<QrCode size={24} />}
                title={sync.isHost ? 'Modo primario · escuchando' : 'Mostrar mi código'}
                description="Muestra un QR para que otro dispositivo lo escanee y se conecte."
                onClick={sync.showQr}
              />
              <OptionCard
                icon={<ScanLine size={24} />}
                title="Conectar a otro dispositivo"
                description="Escanea el QR del otro dispositivo o pega su código."
                onClick={() => setShowConnect(true)}
              />
              <button
                type="button"
                onClick={tryPromote}
                className="flex w-full items-center gap-3 rounded border border-dashed border-border p-3 text-left text-sm hover:bg-surface"
              >
                <Crown size={18} className="text-muted" />
                <span className="flex-1">
                  {sync.isHost ? 'Ya eres el primario' : 'Hacerme primario'}
                </span>
                {!sync.isHost && <ChevronRight size={16} className="text-muted" />}
              </button>
            </>
          )}
      </div>

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
              onClick={() => {
                setShowConnect(false);
                sync.connect(manualId.trim());
              }}
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
                setShowQrScanner(false);
                sync.connect(parsed.peerId);
              } else {
                showToast({
                  title: 'QR no reconocido',
                  variant: 'warning',
                });
              }
            }}
          />
        </div>
      )}

      <ConfirmDialog
        open={promoteOpen}
        onOpenChange={setPromoteOpen}
        title="Hacerme primario"
        description={promotionState}
        confirmLabel="Confirmar"
        onConfirm={doPromote}
      />
    </>
  );
}

function getDeviceIdSafe(): string {
  try {
    return localStorage.getItem('inventek.deviceId') ?? '';
  } catch {
    return '';
  }
}

function PrimaryStatusCard() {
  const sync = useSync();
  if (!sync.primary) {
    return (
      <div className="rounded border border-dashed border-border bg-surface p-3 text-sm text-muted">
        Todavía no hay un dispositivo primario. El primero que sincronice puede
        marcarse como tal y los demás se conectarán a él automáticamente.
      </div>
    );
  }
  const me = getDeviceIdSafe();
  return (
    <div className="rounded border border-border bg-surface p-3">
      <div className="flex items-center gap-2 text-sm">
        <Crown size={16} className={sync.isHost ? 'text-warning' : 'text-muted'} />
        <span className="font-medium">
          {sync.isHost
            ? 'Este dispositivo es el primario'
            : `Primario: ${sync.primary.deviceId === me ? 'tú' : sync.primary.deviceId}`}
        </span>
      </div>
      <div className="mt-1 break-all font-mono text-[11px] text-muted">{sync.primary.peerId}</div>
      {sync.lastSyncAt && (
        <div className="mt-1 text-xs text-muted">
          Última sincronización: {formatDate(sync.lastSyncAt)}
        </div>
      )}
    </div>
  );
}

function SessionView({ qrUrl }: { qrUrl: string | null }) {
  const sync = useSync();
  const { progress, cancel } = sync;
  return (
    <div className="space-y-3">
      <StatusBanner phase={progress.phase} message={progress.errorMessage} />

      {progress.phase === 'waiting' && progress.peerId && (
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

      {(progress.phase === 'syncing' ||
        progress.phase === 'connected' ||
        progress.phase === 'done') && (
        <div className="rounded border border-border bg-surface p-3 text-sm">
          {progress.otherDeviceId && (
            <div className="flex items-center gap-2">
              <Smartphone size={14} className="text-primary" />
              <span className="truncate font-mono text-xs">{progress.otherDeviceId}</span>
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <Stat label="Enviados" value={String(progress.sent)} />
            <Stat label="Recibidos" value={String(progress.received)} />
          </div>
          {progress.applied > 0 && (
            <div className="mt-2 text-xs text-muted">
              <span className="font-medium text-text">
                {progress.applied} cambio{progress.applied === 1 ? '' : 's'} aplicado
                {progress.applied === 1 ? '' : 's'}
              </span>
              {Object.keys(progress.byEntity).length > 0 && (
                <>
                  {': '}
                  {Object.entries(progress.byEntity)
                    .map(([k, v]) => `${v} ${ENTITY_LABEL[k] ?? k}`)
                    .join(' · ')}
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant={progress.phase === 'done' ? 'primary' : 'secondary'} onClick={cancel}>
          {progress.phase === 'done' ? 'Terminar' : 'Cancelar'}
        </Button>
      </div>
    </div>
  );
}

function StatusBanner({ phase, message }: { phase: string; message?: string }) {
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
  if (phase === 'peer-unavailable') {
    return (
      <div className="flex items-start gap-2 rounded border border-warning/40 bg-warning/5 p-3">
        <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-warning" />
        <div className="min-w-0 text-sm">
          <div className="font-medium">Primario no disponible</div>
          <div className="text-xs text-muted">
            El otro dispositivo no tiene la app abierta o no está en la red. Vuelve a intentarlo
            cuando esté online.
          </div>
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
        </div>
      </div>
    );
  }
  const labels: Record<string, string> = {
    opening: 'Abriendo canal en el broker…',
    waiting: 'Esperando al otro dispositivo…',
    connecting: 'Conectando…',
    connected: 'Conectado. Intercambiando watermarks…',
    syncing: 'Sincronizando deltas…',
  };
  if (!labels[phase]) return null;
  return (
    <div className="flex items-center gap-2 rounded border border-border bg-surface p-3 text-sm">
      <Loader2 size={16} className="animate-spin text-primary" />
      <span>{labels[phase]}</span>
    </div>
  );
}

const ENTITY_LABEL: Record<string, string> = {
  product: 'productos',
  warehouse: 'almacenes',
  movement: 'movimientos',
  stockLevelLimits: 'mín/máx',
  stockCount: 'recuentos',
  setting: 'ajustes',
};

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-surface2 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
