/**
 * Save a blob to disk. Uses File System Access API when available,
 * otherwise falls back to a hidden anchor click.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const w = window as unknown as {
      showSaveFilePicker?: (opts: {
        suggestedName?: string;
        types?: Array<{ description?: string; accept: Record<string, string[]> }>;
      }) => Promise<FileSystemFileHandle>;
    };
    if (w.showSaveFilePicker) {
      const ext = filename.split('.').pop() ?? '';
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'Backup Inventek',
            accept: {
              [blob.type || 'application/octet-stream']: [`.${ext}`],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    }
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return false;
    // fall through to anchor
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/**
 * Trigger an open dialog and return the chosen file, or null if cancelled.
 */
export async function pickFile(accept = '.json,.gz,.json.gz'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = () => {
      const f = input.files?.[0] ?? null;
      resolve(f);
    };
    input.oncancel = () => resolve(null);
    document.body.appendChild(input);
    input.click();
    input.remove();
  });
}

export async function shareBlob(blob: Blob, filename: string, title = 'Backup Inventek'): Promise<boolean> {
  const nav = navigator as unknown as {
    share?: (opts: { files?: File[]; title?: string; text?: string }) => Promise<void>;
    canShare?: (opts: { files: File[] }) => boolean;
  };
  if (!nav.share) return false;
  try {
    const file = new File([blob], filename, { type: blob.type });
    if (nav.canShare && !nav.canShare({ files: [file] })) return false;
    await nav.share({ files: [file], title });
    return true;
  } catch {
    return false;
  }
}
