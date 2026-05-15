import { db } from '@/data/db';
import { nowIso } from '@/utils/format';
import { getDeviceId } from '@/platform/device';
import { stablePeerIdForDevice } from '@/platform/p2pSync';
import { appendEvent, buildSettingEvent, fingerprint, fingerprintsMatch, type Fingerprint } from './syncEvents';

const KNOWN_REPLICAS_KEY = 'sync.knownReplicas';
const STALE_REPLICA_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface KnownReplica {
  deviceId: string;
  peerId: string;
  lastSeenAt: string;
}

export async function getKnownReplicas(): Promise<KnownReplica[]> {
  const row = await db.settings.get(KNOWN_REPLICAS_KEY);
  const all = ((row?.value as KnownReplica[] | undefined) ?? []).filter(
    (r) => r.deviceId !== getDeviceId(),
  );
  const cutoff = Date.now() - STALE_REPLICA_MS;
  return all.filter((r) => new Date(r.lastSeenAt).getTime() >= cutoff);
}

/**
 * Records (or refreshes) a known replica so the primary can push to it when
 * it makes local changes. Updates `lastSeenAt` if the entry exists.
 */
export async function rememberReplica(deviceId: string, peerId: string): Promise<void> {
  if (deviceId === getDeviceId()) return;
  const row = await db.settings.get(KNOWN_REPLICAS_KEY);
  const existing = (row?.value as KnownReplica[] | undefined) ?? [];
  const now = nowIso();
  const filtered = existing.filter((r) => r.deviceId !== deviceId);
  filtered.push({ deviceId, peerId, lastSeenAt: now });
  await db.settings.put({ key: KNOWN_REPLICAS_KEY, value: filtered, updatedAt: now });
}

export async function forgetReplica(deviceId: string): Promise<void> {
  const row = await db.settings.get(KNOWN_REPLICAS_KEY);
  if (!row) return;
  const filtered = ((row.value as KnownReplica[] | undefined) ?? []).filter(
    (r) => r.deviceId !== deviceId,
  );
  await db.settings.put({ key: KNOWN_REPLICAS_KEY, value: filtered, updatedAt: nowIso() });
}

export interface PrimaryInfo {
  peerId: string;
  deviceId: string;
  updatedAt: string;
}

const PRIMARY_KEY = 'sync.primary';
const LAST_SYNC_KEY = 'sync.lastSyncAt';

export async function getPrimary(): Promise<PrimaryInfo | null> {
  const row = await db.settings.get(PRIMARY_KEY);
  return (row?.value as PrimaryInfo) ?? null;
}

export async function isPrimary(): Promise<boolean> {
  const p = await getPrimary();
  return p?.deviceId === getDeviceId();
}

/**
 * Sets this device as the primary. Caller is responsible for any precondition
 * check (e.g. fingerprint match). The change is recorded as a sync event so
 * it propagates to replicas on the next sync.
 */
export async function setSelfAsPrimary(): Promise<PrimaryInfo> {
  const info: PrimaryInfo = {
    peerId: stablePeerIdForDevice(getDeviceId()),
    deviceId: getDeviceId(),
    updatedAt: nowIso(),
  };
  await db.transaction('rw', [db.settings, db.syncEvents], async (tx) => {
    await db.settings.put({ key: PRIMARY_KEY, value: info, updatedAt: info.updatedAt });
    await appendEvent(buildSettingEvent(PRIMARY_KEY, info), tx);
  });
  return info;
}

/**
 * Validates the precondition for promotion: the local fingerprint must match
 * (or be ahead of) the primary's fingerprint as captured at the last sync.
 *
 * If we haven't synced with the primary yet, we can't verify safely → returns
 * 'unknown'. Callers can offer a "promote anyway" with explicit warning.
 */
export type PromotionCheck =
  | { ok: true }
  | { ok: false; reason: 'no-primary' | 'is-already-primary' | 'mismatch'; details?: string }
  | { ok: false; reason: 'unknown'; details?: string };

const PRIMARY_FP_KEY = 'sync.primaryFingerprint';

export async function recordPrimaryFingerprint(fp: Fingerprint): Promise<void> {
  await db.settings.put({ key: PRIMARY_FP_KEY, value: fp, updatedAt: nowIso() });
}

export async function getPrimaryFingerprint(): Promise<Fingerprint | null> {
  const row = await db.settings.get(PRIMARY_FP_KEY);
  return (row?.value as Fingerprint) ?? null;
}

export async function canPromoteSelf(): Promise<PromotionCheck> {
  const primary = await getPrimary();
  if (!primary) return { ok: false, reason: 'no-primary' };
  if (primary.deviceId === getDeviceId()) return { ok: false, reason: 'is-already-primary' };
  const stored = await getPrimaryFingerprint();
  if (!stored) return { ok: false, reason: 'unknown', details: 'No tenemos huella registrada del primario.' };
  const mine = await fingerprint();
  if (fingerprintsMatch(mine, stored)) return { ok: true };
  return {
    ok: false,
    reason: 'mismatch',
    details: `Local: ${mine.eventCount} eventos · primario: ${stored.eventCount}. Sincroniza primero.`,
  };
}

export async function markSyncCompleted(): Promise<void> {
  await db.settings.put({ key: LAST_SYNC_KEY, value: nowIso(), updatedAt: nowIso() });
}

export async function getLastSyncAt(): Promise<string | null> {
  const row = await db.settings.get(LAST_SYNC_KEY);
  return (row?.value as string) ?? null;
}
