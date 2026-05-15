import Peer, { type DataConnection } from 'peerjs';
import {
  advanceWatermarks,
  applyEvents,
  computeLocalWatermarks,
  eventsNewerThan,
  fingerprint,
  type Fingerprint,
  type Watermarks,
} from '@/domain/use-cases/syncEvents';
import { rebuildStockLevels } from '@/domain/use-cases/rebuildStockLevels';
import { getDeviceId } from './device';
import type { SyncEvent as InventekSyncEvent } from '@/domain/entities';

export type SyncEvent =
  | { type: 'opening' }
  | { type: 'peer-id'; peerId: string }
  | { type: 'connecting' }
  | { type: 'connected'; otherDeviceId: string }
  | { type: 'exchanging-watermarks' }
  | { type: 'sending'; count: number }
  | { type: 'receiving'; count: number; applied: number }
  | { type: 'done'; sent: number; received: number; otherFingerprint: Fingerprint }
  | { type: 'error'; message: string }
  | { type: 'closed' };

export interface SyncSession {
  destroy: () => void;
}

// ─── Wire protocol ────────────────────────────────────────────────────────

interface HelloMsg {
  type: 'hello';
  deviceId: string;
  appVersion: string;
  watermarks: Watermarks;
  fingerprint: Fingerprint;
}

interface EventsMsg {
  type: 'events';
  events: InventekSyncEvent[];
  done: boolean; // true when this is the last batch
}

interface AckMsg {
  type: 'ack';
  applied: number;
}

type WireMsg = HelloMsg | EventsMsg | AckMsg;

const BATCH_SIZE = 200;

function send(conn: DataConnection, msg: WireMsg) {
  conn.send(JSON.stringify(msg));
}

// ─── Protocol state machine ───────────────────────────────────────────────

function attachProtocol(conn: DataConnection, emit: (e: SyncEvent) => void) {
  let helloReceived = false;
  let peerWatermarks: Watermarks = {};
  let peerFingerprint: Fingerprint | null = null;
  let sentDone = false;
  let receivedDone = false;
  let ackReceived = false;
  let sentCount = 0;
  let receivedCount = 0;
  let appliedCount = 0;
  let anyMovementApplied = false;

  const tryFinish = async () => {
    if (sentDone && receivedDone && ackReceived) {
      if (anyMovementApplied) {
        try {
          await rebuildStockLevels();
        } catch (e) {
          emit({ type: 'error', message: `rebuild: ${(e as Error).message}` });
          return;
        }
      }
      emit({
        type: 'done',
        sent: sentCount,
        received: receivedCount,
        otherFingerprint: peerFingerprint ?? { watermarks: {}, eventCount: 0 },
      });
      setTimeout(() => conn.close(), 300);
    }
  };

  const sendOurEvents = async () => {
    const events = await eventsNewerThan(peerWatermarks);
    sentCount = events.length;
    emit({ type: 'sending', count: events.length });
    // Chunk to keep individual messages reasonable.
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE);
      const isLast = i + BATCH_SIZE >= events.length;
      send(conn, { type: 'events', events: batch, done: isLast });
    }
    if (events.length === 0) {
      send(conn, { type: 'events', events: [], done: true });
    }
    sentDone = true;
  };

  conn.on('data', async (raw: unknown) => {
    try {
      const msg: WireMsg = typeof raw === 'string' ? JSON.parse(raw) : (raw as WireMsg);

      if (msg.type === 'hello') {
        if (helloReceived) return;
        helloReceived = true;
        peerWatermarks = msg.watermarks;
        peerFingerprint = msg.fingerprint;
        emit({ type: 'connected', otherDeviceId: msg.deviceId });
        emit({ type: 'exchanging-watermarks' });
        await sendOurEvents();
        return;
      }

      if (msg.type === 'events') {
        if (msg.events.length > 0) {
          const result = await applyEvents(msg.events);
          appliedCount += result.applied;
          receivedCount += msg.events.length;
          if (result.movementsTouched > 0) anyMovementApplied = true;
          emit({ type: 'receiving', count: receivedCount, applied: appliedCount });
          // Advance our watermarks to the highest id per device in this batch.
          const incoming: Watermarks = {};
          for (const ev of msg.events) {
            const cur = incoming[ev.deviceId];
            if (!cur || ev.id > cur) incoming[ev.deviceId] = ev.id;
          }
          await advanceWatermarks(incoming);
        }
        if (msg.done) {
          receivedDone = true;
          send(conn, { type: 'ack', applied: appliedCount });
          await tryFinish();
        }
        return;
      }

      if (msg.type === 'ack') {
        ackReceived = true;
        await tryFinish();
        return;
      }
    } catch (err) {
      emit({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  conn.on('close', () => emit({ type: 'closed' }));
  conn.on('error', (err: Error) => emit({ type: 'error', message: err.message }));

  // Send our hello first.
  void (async () => {
    const [watermarks, fp] = await Promise.all([computeLocalWatermarks(), fingerprint()]);
    send(conn, {
      type: 'hello',
      deviceId: getDeviceId(),
      appVersion: __APP_VERSION__,
      watermarks,
      fingerprint: fp,
    });
  })();
}

// ─── Public API ───────────────────────────────────────────────────────────

export function startHost(
  emit: (e: SyncEvent) => void,
  opts: { peerId?: string } = {},
): SyncSession {
  emit({ type: 'opening' });
  const peer = opts.peerId ? new Peer(opts.peerId, { debug: 0 }) : new Peer({ debug: 0 });
  peer.on('open', (id) => emit({ type: 'peer-id', peerId: id }));
  peer.on('error', (err) =>
    emit({ type: 'error', message: err.message ?? String(err) }),
  );
  peer.on('connection', (conn) => {
    conn.on('open', () => attachProtocol(conn, emit));
    conn.on('error', (err) => emit({ type: 'error', message: err.message }));
  });
  return {
    destroy: () => {
      try {
        peer.destroy();
      } catch {
        // ignore
      }
    },
  };
}

export function connectToHost(
  peerId: string,
  emit: (e: SyncEvent) => void,
): SyncSession {
  emit({ type: 'opening' });
  const peer = new Peer({ debug: 0 });
  let conn: DataConnection | null = null;
  peer.on('open', () => {
    emit({ type: 'connecting' });
    conn = peer.connect(peerId, { reliable: true });
    conn.on('open', () => attachProtocol(conn!, emit));
    conn.on('error', (err) => emit({ type: 'error', message: err.message }));
  });
  peer.on('error', (err) =>
    emit({ type: 'error', message: err.message ?? String(err) }),
  );
  return {
    destroy: () => {
      try {
        conn?.close();
      } catch {
        // ignore
      }
      try {
        peer.destroy();
      } catch {
        // ignore
      }
    },
  };
}

/**
 * Builds a stable peer-id for this device so replicas can reconnect to the
 * same broker entry without rescanning a QR every time.
 */
export function stablePeerIdForDevice(deviceId: string): string {
  // PeerJS accepts ids with letters, numbers and a few separators. ULIDs
  // already qualify, so we just prefix.
  const clean = deviceId.replace(/[^a-zA-Z0-9]/g, '');
  return `inventek-${clean}`.slice(0, 64);
}

declare const __APP_VERSION__: string;
