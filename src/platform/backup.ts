import { db } from '@/data/db';
import { getDeviceId } from './device';
import { nowIso } from '@/utils/format';
import { newId } from '@/utils/ulid';
import pako from 'pako';
import { getBackupStore, type BackupEntry } from './backupStore';

export const BACKUP_SCHEMA = 'inventek/backup/v1';

export interface BackupFile {
  $schema: typeof BACKUP_SCHEMA;
  exportedAt: string;
  deviceId: string;
  appVersion: string;
  data: {
    warehouses: unknown[];
    categories: unknown[];
    suppliers: unknown[];
    products: unknown[];
    stockLevels: unknown[];
    movements: unknown[];
    movementLines: unknown[];
    stockCounts: unknown[];
    users: unknown[];
    settings: unknown[];
  };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (const byte of buf) bin += String.fromCharCode(byte);
  return btoa(bin);
}

function base64ToBlob(b64: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr]);
}

async function serializeProducts(): Promise<unknown[]> {
  const all = await db.products.toArray();
  return Promise.all(
    all.map(async (p) => ({
      ...p,
      imageBlob: p.imageBlob ? await blobToBase64(p.imageBlob) : undefined,
    })),
  );
}

function deserializeProducts(raw: unknown[]): unknown[] {
  return raw.map((p) => {
    const r = p as Record<string, unknown>;
    if (typeof r.imageBlob === 'string') {
      return { ...r, imageBlob: base64ToBlob(r.imageBlob) };
    }
    return r;
  });
}

export async function exportBackup(): Promise<BackupFile> {
  const [
    warehouses,
    categories,
    suppliers,
    products,
    stockLevels,
    movements,
    movementLines,
    stockCounts,
    users,
    settings,
  ] = await Promise.all([
    db.warehouses.toArray(),
    db.categories.toArray(),
    db.suppliers.toArray(),
    serializeProducts(),
    db.stockLevels.toArray(),
    db.movements.toArray(),
    db.movementLines.toArray(),
    db.stockCounts.toArray(),
    db.users.toArray(),
    db.settings.toArray(),
  ]);

  return {
    $schema: BACKUP_SCHEMA,
    exportedAt: nowIso(),
    deviceId: getDeviceId(),
    appVersion: __APP_VERSION__,
    data: {
      warehouses,
      categories,
      suppliers,
      products,
      stockLevels,
      movements,
      movementLines,
      stockCounts,
      users,
      settings,
    },
  };
}

export async function exportBackupBlob(opts: { gzip?: boolean } = {}): Promise<{ blob: Blob; filename: string }> {
  const backup = await exportBackup();
  const json = JSON.stringify(backup);
  const stamp = backup.exportedAt.replace(/[:.]/g, '-');
  if (opts.gzip ?? true) {
    const gz = pako.gzip(json);
    return {
      blob: new Blob([gz], { type: 'application/gzip' }),
      filename: `inventek-${stamp}.json.gz`,
    };
  }
  return {
    blob: new Blob([json], { type: 'application/json' }),
    filename: `inventek-${stamp}.json`,
  };
}

export interface ImportSummary {
  warehouses: number;
  categories: number;
  suppliers: number;
  products: number;
  stockLevels: number;
  movements: number;
  movementLines: number;
  stockCounts: number;
  users: number;
  settings: number;
}

export async function readBackupFromBlob(blob: Blob): Promise<BackupFile> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let text: string;
  // Detect gzip magic bytes
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    text = pako.ungzip(buf, { to: 'string' });
  } else {
    text = new TextDecoder().decode(buf);
  }
  const parsed = JSON.parse(text);
  if (parsed?.$schema !== BACKUP_SCHEMA) {
    throw new Error('No es un backup de Inventek (esquema desconocido).');
  }
  return parsed as BackupFile;
}

export async function importBackup(
  file: BackupFile,
  mode: 'replace' | 'merge',
): Promise<ImportSummary> {
  return db.transaction(
    'rw',
    [
      db.warehouses,
      db.categories,
      db.suppliers,
      db.products,
      db.stockLevels,
      db.movements,
      db.movementLines,
      db.stockCounts,
      db.users,
      db.settings,
    ],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          db.warehouses.clear(),
          db.categories.clear(),
          db.suppliers.clear(),
          db.products.clear(),
          db.stockLevels.clear(),
          db.movements.clear(),
          db.movementLines.clear(),
          db.stockCounts.clear(),
          db.users.clear(),
          db.settings.clear(),
        ]);
      }
      const d = file.data;
      const productsHydrated = deserializeProducts(d.products);
      const tables = [
        [db.warehouses, d.warehouses] as const,
        [db.categories, d.categories] as const,
        [db.suppliers, d.suppliers] as const,
        [db.products, productsHydrated] as const,
        [db.stockLevels, d.stockLevels] as const,
        [db.movements, d.movements] as const,
        [db.movementLines, d.movementLines] as const,
        [db.stockCounts, d.stockCounts] as const,
        [db.users, d.users] as const,
        [db.settings, d.settings] as const,
      ];
      const summary: ImportSummary = {
        warehouses: d.warehouses.length,
        categories: d.categories.length,
        suppliers: d.suppliers.length,
        products: d.products.length,
        stockLevels: d.stockLevels.length,
        movements: d.movements.length,
        movementLines: d.movementLines.length,
        stockCounts: d.stockCounts.length,
        users: d.users.length,
        settings: d.settings.length,
      };
      for (const [table, rows] of tables) {
        if (rows.length > 0) await (table as unknown as { bulkPut: (r: unknown[]) => Promise<unknown> }).bulkPut(rows);
      }
      return summary;
    },
  );
}

/**
 * Saves a backup snapshot to local persistent storage. Uses OPFS where
 * available (Chromium, Firefox, recent Safari desktop), falls back to a
 * separate IndexedDB database (`inventek_backups`) on iOS Safari and
 * environments without writable OPFS.
 */
export async function saveBackupLocal(): Promise<BackupEntry | null> {
  try {
    const { blob, filename } = await exportBackupBlob({ gzip: true });
    const store = await getBackupStore();
    return await store.save(blob, filename);
  } catch {
    return null;
  }
}

export async function listLocalBackups(): Promise<BackupEntry[]> {
  try {
    const store = await getBackupStore();
    return await store.list();
  } catch {
    return [];
  }
}

export async function readLocalBackup(id: string): Promise<Blob | null> {
  try {
    const store = await getBackupStore();
    return await store.read(id);
  } catch {
    return null;
  }
}

export async function removeLocalBackup(id: string): Promise<void> {
  const store = await getBackupStore();
  await store.remove(id);
}

export async function pruneLocalBackups(keep = 14): Promise<number> {
  try {
    const store = await getBackupStore();
    return await store.prune(keep);
  } catch {
    return 0;
  }
}

export async function clearLocalBackups(): Promise<void> {
  const store = await getBackupStore();
  await store.clear();
}

// Generates a fresh ULID-tagged id (used by callers that want a unique handle).
export function backupHandle(): string {
  return `bk_${newId()}`;
}

declare const __APP_VERSION__: string;
