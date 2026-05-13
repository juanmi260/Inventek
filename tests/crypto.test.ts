import { describe, it, expect } from 'vitest';
import {
  decryptBlob,
  encryptBlob,
  hashPin,
  isEncryptedBackup,
  verifyPin,
} from '@/platform/crypto';

describe('encryptBlob / decryptBlob', () => {
  it('round-trips a small payload', async () => {
    const plain = new Blob([new TextEncoder().encode('hola mundo, secretos')]);
    const enc = await encryptBlob(plain, 'pass1234');
    expect(await isEncryptedBackup(enc)).toBe(true);
    const dec = await decryptBlob(enc, 'pass1234');
    expect(new TextDecoder().decode(await dec.arrayBuffer())).toBe(
      'hola mundo, secretos',
    );
  });

  it('rejects wrong passphrase', async () => {
    const plain = new Blob([new TextEncoder().encode('algo')]);
    const enc = await encryptBlob(plain, 'real-pass');
    await expect(decryptBlob(enc, 'otra-pass')).rejects.toThrow();
  });

  it('detects non-encrypted blobs as not encrypted', async () => {
    const blob = new Blob([new TextEncoder().encode('{"hello":"world"}')]);
    expect(await isEncryptedBackup(blob)).toBe(false);
  });

  it('produces different ciphertexts for the same plaintext (random IV/salt)', async () => {
    const plain = new Blob([new TextEncoder().encode('repeat')]);
    const a = await encryptBlob(plain, 'p');
    const b = await encryptBlob(plain, 'p');
    const aBuf = new Uint8Array(await a.arrayBuffer());
    const bBuf = new Uint8Array(await b.arrayBuffer());
    expect(aBuf.length).toBe(bBuf.length);
    let differs = false;
    for (let i = 0; i < aBuf.length; i++) {
      if (aBuf[i] !== bBuf[i]) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });
});

describe('hashPin / verifyPin', () => {
  it('verifies the right pin', async () => {
    const h = await hashPin('1234');
    expect(await verifyPin('1234', h)).toBe(true);
  });

  it('rejects a wrong pin', async () => {
    const h = await hashPin('1234');
    expect(await verifyPin('0000', h)).toBe(false);
  });

  it('produces different salts each time', async () => {
    const a = await hashPin('1234');
    const b = await hashPin('1234');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(await verifyPin('1234', a)).toBe(true);
    expect(await verifyPin('1234', b)).toBe(true);
  });
});
