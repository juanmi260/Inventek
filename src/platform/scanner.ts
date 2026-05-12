import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';

export type ScanCallback = (text: string) => void;

export interface ScannerControls {
  stop: () => void;
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
 * Manual scanner setup. iOS Safari (especially in standalone PWA mode) is
 * picky about how the video element is configured *before* the stream is
 * attached and *before* `.play()` is awaited. Doing this ourselves and only
 * handing the already-playing element to ZXing for decode-only has been the
 * most reliable path.
 */
export async function startScanner(
  videoEl: HTMLVideoElement,
  onResult: ScanCallback,
): Promise<ScannerControls> {
  // 1. iOS-friendly attributes BEFORE attaching a stream.
  videoEl.setAttribute('autoplay', '');
  videoEl.setAttribute('muted', '');
  videoEl.setAttribute('playsinline', '');
  // Older WebKit needs the legacy attribute name too.
  videoEl.setAttribute('webkit-playsinline', '');
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.controls = false;

  // 2. Acquire the rear camera explicitly (ideal, not exact, for graceful
  //    fallback on devices without an environment camera).
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });

  // 3. Attach stream and explicitly await play(). On iOS this can reject
  //    with NotAllowedError if autoplay is blocked; we surface that.
  videoEl.srcObject = stream;
  try {
    await videoEl.play();
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    videoEl.srcObject = null;
    throw e;
  }

  // 4. Hand the already-playing element to ZXing. Using decodeFromVideoElement
  //    means ZXing won't try to (re)acquire the stream or call play() again.
  const reader = new BrowserMultiFormatReader(hints);
  const decoder = await reader.decodeFromVideoElement(videoEl, (result) => {
    if (result) onResult(result.getText());
  });

  return {
    stop: () => {
      try {
        decoder.stop();
      } catch {
        // ignore
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
