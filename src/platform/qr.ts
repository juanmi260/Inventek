import QRCode from 'qrcode';
import pako from 'pako';

/**
 * Renders a QR code as a data URL for an <img>.
 */
export async function renderQrDataUrl(
  text: string,
  opts: { width?: number; margin?: number } = {},
): Promise<string> {
  return await QRCode.toDataURL(text, {
    width: opts.width ?? 320,
    margin: opts.margin ?? 1,
    errorCorrectionLevel: 'M',
  });
}

// ─── Payload encoding ─────────────────────────────────────────────────────

/**
 * Inventek QR payloads carry a typed prefix so we can detect them while
 * scanning regular product barcodes. Two formats:
 *   INVK1-PEER:<peerId>                      → start a sync session
 *   INVK1-PROD:<base64url(gzip(productJson))> → share a product
 */
export type InventekPayload =
  | { kind: 'peer'; peerId: string }
  | { kind: 'product'; data: unknown }
  | { kind: 'unknown'; raw: string };

const PEER_PREFIX = 'INVK1-PEER:';
const PROD_PREFIX = 'INVK1-PROD:';

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    );
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  const full = pad ? padded + '='.repeat(4 - pad) : padded;
  const bin = atob(full);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export function encodePeerPayload(peerId: string): string {
  return `${PEER_PREFIX}${peerId}`;
}

export function encodeProductPayload(product: unknown): string {
  const json = JSON.stringify(product);
  const gz = pako.gzip(json);
  return `${PROD_PREFIX}${base64UrlEncode(gz)}`;
}

export function decodeProductPayload(text: string): unknown | null {
  if (!text.startsWith(PROD_PREFIX)) return null;
  try {
    const bytes = base64UrlDecode(text.slice(PROD_PREFIX.length));
    const json = pako.ungzip(bytes, { to: 'string' });
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function parsePayload(text: string): InventekPayload {
  if (text.startsWith(PEER_PREFIX)) {
    return { kind: 'peer', peerId: text.slice(PEER_PREFIX.length) };
  }
  if (text.startsWith(PROD_PREFIX)) {
    const data = decodeProductPayload(text);
    if (data) return { kind: 'product', data };
  }
  return { kind: 'unknown', raw: text };
}
