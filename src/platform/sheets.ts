import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export type Row = Record<string, string | number | boolean | null | undefined>;

/**
 * Builds a CSV blob from rows. Empty rows yields an empty CSV with no header.
 */
export function toCsvBlob(rows: Row[]): Blob {
  const csv = Papa.unparse(rows, { quotes: false });
  return new Blob([csv], { type: 'text/csv;charset=utf-8' });
}

/**
 * Builds an XLSX blob with one or more sheets. Each entry of `sheets` is
 * { name, rows }. Names get auto-truncated to Excel's 31-char limit.
 */
export function toXlsxBlob(sheets: Array<{ name: string; rows: Row[] }>): Blob {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const safeName = s.name.slice(0, 31);
    const ws = XLSX.utils.json_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }
  const arr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([arr], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function timestampedName(prefix: string, ext: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}.${ext}`;
}
