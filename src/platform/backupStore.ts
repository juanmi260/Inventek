import Dexie, { type Table } from 'dexie';

export interface BackupEntry {
  id: string;
  name: string;
  size: number;
  /** epoch ms when the backup was written */
  mtime: number;
}

export interface BackupStore {
  /** Human-readable backend name shown in the UI. */
  backend: 'opfs' | 'idb';
  save(blob: Blob, filename: string): Promise<BackupEntry>;
  list(): Promise<BackupEntry[]>;
  read(id: string): Promise<Blob | null>;
  remove(id: string): Promise<void>;
  prune(keep: number): Promise<number>;
  clear(): Promise<void>;
}

// ─── OPFS implementation ──────────────────────────────────────────────────

const OPFS_DIR = 'backups';

const opfsStore: BackupStore = {
  backend: 'opfs',

  async save(blob, filename) {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
    const fh = await dir.getFileHandle(filename, { create: true });
    // createWritable is the iOS-Safari-missing API.
    const writable = await (fh as unknown as { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
    await writable.write(blob);
    await writable.close();
    const f = await fh.getFile();
    return { id: filename, name: filename, size: f.size, mtime: f.lastModified };
  },

  async list() {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
    const items: BackupEntry[] = [];
    // @ts-expect-error TS lib does not yet include .values()
    for await (const entry of dir.values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        items.push({ id: entry.name, name: entry.name, size: file.size, mtime: file.lastModified });
      }
    }
    return items.sort((a, b) => b.mtime - a.mtime);
  },

  async read(id) {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(OPFS_DIR);
      const fh = await dir.getFileHandle(id);
      return await fh.getFile();
    } catch {
      return null;
    }
  },

  async remove(id) {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(OPFS_DIR);
      await dir.removeEntry(id);
    } catch {
      // ignore
    }
  },

  async prune(keep) {
    const items = await this.list();
    const toRemove = items.slice(keep);
    for (const it of toRemove) await this.remove(it.id);
    return toRemove.length;
  },

  async clear() {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(OPFS_DIR, { recursive: true });
    } catch {
      // ignore
    }
  },
};

// ─── IndexedDB fallback (iOS Safari, older browsers) ──────────────────────

interface ArchiveRow {
  id: string;
  name: string;
  size: number;
  mtime: number;
  blob: Blob;
}

class BackupDB extends Dexie {
  archives!: Table<ArchiveRow, string>;
  constructor() {
    super('inventek_backups');
    this.version(1).stores({
      archives: 'id, mtime',
    });
  }
}

const backupDb = new BackupDB();

const idbStore: BackupStore = {
  backend: 'idb',

  async save(blob, filename) {
    const now = Date.now();
    const row: ArchiveRow = { id: filename, name: filename, size: blob.size, mtime: now, blob };
    await backupDb.archives.put(row);
    return { id: row.id, name: row.name, size: row.size, mtime: row.mtime };
  },

  async list() {
    const rows = await backupDb.archives.orderBy('mtime').reverse().toArray();
    return rows.map(({ id, name, size, mtime }) => ({ id, name, size, mtime }));
  },

  async read(id) {
    const row = await backupDb.archives.get(id);
    return row?.blob ?? null;
  },

  async remove(id) {
    await backupDb.archives.delete(id);
  },

  async prune(keep) {
    const all = await this.list();
    const toRemove = all.slice(keep);
    for (const it of toRemove) await this.remove(it.id);
    return toRemove.length;
  },

  async clear() {
    await backupDb.archives.clear();
  },
};

// ─── Capability detection (cached) ────────────────────────────────────────

let cached: Promise<BackupStore> | null = null;

async function isOpfsWritable(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return false;
  try {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle('.inventek-cap-test', { create: true });
    const handle = fh as unknown as { createWritable?: () => Promise<FileSystemWritableFileStream> };
    if (typeof handle.createWritable !== 'function') {
      // Try to remove the test file even if write is not available.
      try {
        await root.removeEntry('.inventek-cap-test');
      } catch {
        // ignore
      }
      return false;
    }
    const w = await handle.createWritable();
    await w.close();
    await root.removeEntry('.inventek-cap-test');
    return true;
  } catch {
    return false;
  }
}

export async function getBackupStore(): Promise<BackupStore> {
  if (!cached) {
    cached = (async () => {
      const opfsOk = await isOpfsWritable();
      return opfsOk ? opfsStore : idbStore;
    })();
  }
  return cached;
}

export async function describeBackupBackend(): Promise<{
  backend: 'opfs' | 'idb';
  label: string;
}> {
  const store = await getBackupStore();
  return {
    backend: store.backend,
    label:
      store.backend === 'opfs'
        ? 'Sistema de ficheros del navegador (OPFS).'
        : 'Base de datos local (IndexedDB, separada de tus datos principales).',
  };
}
