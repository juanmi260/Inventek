import Peer, { type DataConnection } from 'peerjs';
import pako from 'pako';
import { exportBackup, importBackup, type BackupFile } from './backup';
import { rebuildStockLevels } from '@/domain/use-cases/rebuildStockLevels';
import { getDeviceId } from './device';

export type SyncEvent =
  | { type: 'opening' }
  | { type: 'peer-id'; peerId: string }
  | { type: 'connecting' }
  | { type: 'connected'; otherDeviceId: string }
  | { type: 'sent-snapshot'; bytes: number }
  | { type: 'received-snapshot'; bytes: number; count: number }
  | { type: 'done'; sent: number; received: number }
  | { type: 'error'; message: string }
  | { type: 'closed' };

export interface SyncSession {
  destroy: () => void;
}

interface HelloMsg {
  type: 'hello';
  deviceId: string;
  appVersion: string;
}
interface SnapshotMsg {
  type: 'snapshot';
  payload: string; // base64-encoded gzipped JSON of a BackupFile
}
interface AckMsg {
  type: 'ack';
  applied: number;
}
type WireMsg = HelloMsg | SnapshotMsg | AckMsg;

function send(conn: DataConnection, msg: WireMsg) {
  conn.send(JSON.stringify(msg));
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function buildSnapshot(): Promise<{ msg: SnapshotMsg; bytes: number }> {
  const backup = await exportBackup();
  const json = JSON.stringify(backup);
  const gz = pako.gzip(json);
  const payload = bytesToBase64(gz);
  return { msg: { type: 'snapshot', payload }, bytes: gz.length };
}

async function applySnapshot(msg: SnapshotMsg): Promise<{ count: number; bytes: number }> {
  const bytes = base64ToBytes(msg.payload);
  const json = pako.ungzip(bytes, { to: 'string' });
  const backup = JSON.parse(json) as BackupFile;
  const summary = await importBackup(backup, 'merge');
  const count = Object.values(summary).reduce((a, b) => a + b, 0);
  return { count, bytes: bytes.length };
}

function attachProtocol(conn: DataConnection, emit: (e: SyncEvent) => void) {
  let theirDeviceId: string | null = null;
  let snapshotReceived = false;
  let ackReceived = false;
  let sentBytes = 0;
  let recvCount = 0;
  let recvBytes = 0;

  const tryFinish = async () => {
    if (snapshotReceived && ackReceived) {
      try {
        await rebuildStockLevels();
      } catch (e) {
        emit({ type: 'error', message: `rebuildStockLevels: ${(e as Error).message}` });
        return;
      }
      emit({ type: 'done', sent: sentBytes, received: recvBytes });
      setTimeout(() => conn.close(), 300);
    }
  };

  conn.on('data', async (raw: unknown) => {
    try {
      const msg: WireMsg =
        typeof raw === 'string' ? JSON.parse(raw) : (raw as WireMsg);
      if (msg.type === 'hello') {
        theirDeviceId = msg.deviceId;
        emit({ type: 'connected', otherDeviceId: msg.deviceId });
        // Build and send our snapshot.
        const { msg: snap, bytes } = await buildSnapshot();
        sentBytes = bytes;
        send(conn, snap);
        emit({ type: 'sent-snapshot', bytes });
      } else if (msg.type === 'snapshot') {
        const { count, bytes } = await applySnapshot(msg);
        recvCount = count;
        recvBytes = bytes;
        snapshotReceived = true;
        emit({ type: 'received-snapshot', bytes, count });
        send(conn, { type: 'ack', applied: count });
      } else if (msg.type === 'ack') {
        ackReceived = true;
        await tryFinish();
        return;
      }
      await tryFinish();
    } catch (err) {
      emit({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  conn.on('close', () => {
    emit({ type: 'closed' });
  });
  conn.on('error', (err: Error) => {
    emit({ type: 'error', message: err.message });
  });

  // Open: send our hello first.
  send(conn, {
    type: 'hello',
    deviceId: getDeviceId(),
    appVersion: __APP_VERSION__,
  });

  // Reference theirDeviceId/recvCount somewhere so TS doesn't complain.
  void theirDeviceId;
  void recvCount;
}

/**
 * Starts a sync session as the "host": creates a peer with the public
 * PeerJS broker and waits for the other side to connect using the assigned
 * peer ID (shown to the user as a QR / text code).
 */
export function startHost(emit: (e: SyncEvent) => void): SyncSession {
  emit({ type: 'opening' });
  const peer = new Peer({ debug: 0 });
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

/**
 * Connects to a host using their peer ID.
 */
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

declare const __APP_VERSION__: string;
