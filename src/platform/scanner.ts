import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';

export type ScanCallback = (text: string) => void;

export interface ScannerControls {
  stop: () => void;
}

export interface StartScannerOptions {
  /** Called if the camera track dies unexpectedly after a successful start. */
  onStreamEnded?: () => void;
}

const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
]);

/**
 * Resolves as soon as the camera stream is attached and `<video>` is playing.
 * The barcode decoder is launched in the background and does not block start;
 * if it fails to initialize the camera still works visually and the user gets
 * a clear failure mode.
 */
export async function startScanner(
  videoEl: HTMLVideoElement,
  onResult: ScanCallback,
  opts: StartScannerOptions = {},
): Promise<ScannerControls> {
  // 1. iOS-friendly attributes BEFORE attaching a stream.
  videoEl.setAttribute('autoplay', '');
  videoEl.setAttribute('muted', '');
  videoEl.setAttribute('playsinline', '');
  videoEl.setAttribute('webkit-playsinline', '');
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.controls = false;

  // 2. Acquire the rear camera explicitly.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });

  // 3. Watch for iOS killing the stream after the fact.
  const onEnded = () => {
    opts.onStreamEnded?.();
  };
  stream.getVideoTracks().forEach((t) => t.addEventListener('ended', onEnded));

  // 4. Attach stream and explicitly await play().
  videoEl.srcObject = stream;
  try {
    await videoEl.play();
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    videoEl.srcObject = null;
    throw e;
  }

  // 5. Start the decoder in the background — do NOT await it. If iOS revokes
  //    the stream `decodeFromVideoElement` can hang indefinitely waiting for
  //    a first frame; we don't want that to block start().
  let decoder: { stop: () => void } | null = null;
  let stopped = false;
  const reader = new BrowserMultiFormatReader(hints);

  reader
    .decodeFromVideoElement(videoEl, (result) => {
      if (result) onResult(result.getText());
    })
    .then((d) => {
      if (stopped) {
        try {
          d.stop();
        } catch {
          // ignore
        }
      } else {
        decoder = d;
      }
    })
    .catch((err) => {
      // Decoder couldn't start (e.g. iOS killed the stream); surface it
      // through the same ended hook so the UI shows a clean error instead
      // of a spinner forever.
      console.warn('[scanner] decoder failed to start:', err);
      opts.onStreamEnded?.();
    });

  return {
    stop: () => {
      stopped = true;
      stream.getVideoTracks().forEach((t) => t.removeEventListener('ended', onEnded));
      if (decoder) {
        try {
          decoder.stop();
        } catch {
          // ignore
        }
        decoder = null;
      }
      stream.getTracks().forEach((t) => t.stop());
      videoEl.srcObject = null;
    },
  };
}

export async function getCameraPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  if (typeof navigator === 'undefined' || !navigator.permissions) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return status.state as 'granted' | 'denied' | 'prompt';
  } catch {
    return 'unknown';
  }
}

export function hapticTap(durationMs = 15) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(durationMs);
  }
}
