/**
 * Symmetric encryption helpers for backup files and PIN hashing.
 *
 * Backup payload layout (binary):
 *   bytes 0..7    : magic 'INVK1ENC'
 *   byte  8       : version (currently 1)
 *   bytes 9..24   : 16-byte salt for PBKDF2
 *   bytes 25..36  : 12-byte IV for AES-GCM
 *   bytes 37..    : ciphertext (AES-GCM 256)
 */

const MAGIC = new TextEncoder().encode('INVK1ENC'); // 8 bytes
const VERSION = 1;
const SALT_LEN = 16;
const IV_LEN = 12;
const PBKDF2_ITERATIONS = 200_000;
const HEADER_LEN = MAGIC.length + 1 + SALT_LEN + IV_LEN; // 37

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  usage: 'encrypt' | 'decrypt',
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase) as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

function randomBytes(n: number): Uint8Array {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return arr;
}

/**
 * Returns true if the blob looks like an Inventek encrypted backup.
 */
export async function isEncryptedBackup(blob: Blob): Promise<boolean> {
  if (blob.size < HEADER_LEN) return false;
  const head = new Uint8Array(await blob.slice(0, MAGIC.length).arrayBuffer());
  for (let i = 0; i < MAGIC.length; i++) {
    if (head[i] !== MAGIC[i]) return false;
  }
  return true;
}

export async function encryptBlob(plain: Blob, passphrase: string): Promise<Blob> {
  if (!passphrase) throw new Error('Falta la contraseña.');
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = await deriveKey(passphrase, salt, 'encrypt');
  const plaintext = new Uint8Array(await plain.arrayBuffer());
  const cipherBuf = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      plaintext as BufferSource,
    ),
  );

  const out = new Uint8Array(HEADER_LEN + cipherBuf.length);
  out.set(MAGIC, 0);
  out[MAGIC.length] = VERSION;
  out.set(salt, MAGIC.length + 1);
  out.set(iv, MAGIC.length + 1 + SALT_LEN);
  out.set(cipherBuf, HEADER_LEN);
  return new Blob([out], { type: 'application/octet-stream' });
}

export async function decryptBlob(encrypted: Blob, passphrase: string): Promise<Blob> {
  const buf = new Uint8Array(await encrypted.arrayBuffer());
  if (buf.length < HEADER_LEN) throw new Error('Fichero demasiado corto.');
  for (let i = 0; i < MAGIC.length; i++) {
    if (buf[i] !== MAGIC[i]) throw new Error('No parece un backup cifrado de Inventek.');
  }
  const version = buf[MAGIC.length];
  if (version !== VERSION) throw new Error(`Versión de cifrado no soportada: ${version}`);
  const salt = buf.slice(MAGIC.length + 1, MAGIC.length + 1 + SALT_LEN);
  const iv = buf.slice(MAGIC.length + 1 + SALT_LEN, HEADER_LEN);
  const ciphertext = buf.slice(HEADER_LEN);

  let plainBuf: ArrayBuffer;
  try {
    const key = await deriveKey(passphrase, salt, 'decrypt');
    plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
  } catch {
    throw new Error('Contraseña incorrecta o fichero corrupto.');
  }
  return new Blob([plainBuf]);
}

// ─── PIN hashing ──────────────────────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export interface PinHash {
  salt: string; // base64
  hash: string; // base64
}

export async function hashPin(pin: string): Promise<PinHash> {
  const salt = randomBytes(16);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin) as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return { salt: toBase64(salt), hash: toBase64(new Uint8Array(bits)) };
}

export async function verifyPin(pin: string, stored: PinHash): Promise<boolean> {
  const salt = fromBase64(stored.salt);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin) as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  const got = toBase64(new Uint8Array(bits));
  // Constant-time comparison.
  if (got.length !== stored.hash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < got.length; i++) {
    mismatch |= got.charCodeAt(i) ^ stored.hash.charCodeAt(i);
  }
  return mismatch === 0;
}
