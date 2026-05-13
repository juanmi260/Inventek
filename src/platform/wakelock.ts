/**
 * Acquires a Screen Wake Lock to keep the display on while the user is
 * busy with a long operation (e.g. a physical stock count). Returns a
 * disposer; if the API isn't available the disposer is a no-op.
 */
type SentinelLike = { release: () => Promise<void> } | null;

export async function acquireWakeLock(): Promise<() => void> {
  const nav = navigator as unknown as {
    wakeLock?: { request: (type: 'screen') => Promise<SentinelLike> };
  };
  if (!nav.wakeLock?.request) return () => {};
  let sentinel: SentinelLike = null;
  try {
    sentinel = await nav.wakeLock.request('screen');
  } catch {
    return () => {};
  }

  // The system can release the lock automatically when the page becomes
  // hidden. Re-acquire on visibility change.
  const onVis = async () => {
    if (document.visibilityState === 'visible' && !sentinel) {
      try {
        sentinel = await nav.wakeLock!.request('screen');
      } catch {
        // ignore
      }
    }
  };
  document.addEventListener('visibilitychange', onVis);

  return () => {
    document.removeEventListener('visibilitychange', onVis);
    sentinel?.release().catch(() => {});
    sentinel = null;
  };
}
