/**
 * Lightweight beep helper using WebAudio. The context is created lazily on
 * the first call (which must originate from a user gesture on iOS Safari)
 * and cached for subsequent beeps.
 */
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    typeof window !== 'undefined' &&
    ((window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

export interface BeepOptions {
  frequency?: number;
  durationMs?: number;
  volume?: number;
  type?: OscillatorType;
}

/**
 * Plays a short beep. Safe to call without a gesture — it'll just be a no-op
 * if the AudioContext is suspended.
 */
export function beep(opts: BeepOptions = {}): void {
  const c = getCtx();
  if (!c) return;
  // Resume best-effort; if it doesn't resolve, the beep just won't be heard.
  void c.resume();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.value = opts.frequency ?? 1200;
  const vol = opts.volume ?? 0.08;
  const dur = (opts.durationMs ?? 90) / 1000;
  const now = c.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(vol, now + 0.005);
  gain.gain.linearRampToValueAtTime(0, now + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + dur);
}

/** A second, lower-pitched beep used for errors / "not found". */
export function errorBuzz(): void {
  beep({ frequency: 220, durationMs: 180, type: 'square', volume: 0.06 });
}
