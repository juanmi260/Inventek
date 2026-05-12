export function formatNumber(n: number, locale = navigator.language): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(n);
}

export function formatMoney(n: number, currency = 'EUR', locale = navigator.language): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);
}

export function formatDate(iso: string, locale = navigator.language): string {
  const d = new Date(iso);
  return d.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
