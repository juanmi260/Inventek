/**
 * Loads an image File/Blob into an HTMLImageElement.
 */
async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }
}

/**
 * Resizes an image so that its longest side is at most `maxSize`, then encodes
 * to JPEG with the given quality. Honors orientation via the browser's native
 * decode. Returns a Blob ready to persist.
 */
export async function compressImage(
  file: File | Blob,
  opts: { maxSize?: number; quality?: number } = {},
): Promise<Blob> {
  const maxSize = opts.maxSize ?? 800;
  const quality = opts.quality ?? 0.8;

  const img = await loadImage(file);
  const { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no soportado');
  ctx.drawImage(img, 0, 0, tw, th);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error('No se pudo codificar la imagen'));
        else resolve(b);
      },
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Convenience: returns an object URL for a Blob. Caller must revoke it
 * (use `useImageUrl` hook to manage lifecycle in React).
 */
export function blobUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}
