import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from './Button';
import { showToast } from './Toast';
import { exportToFile, type ExportOptions } from '@/domain/use-cases/exportData';
import { saveBlob, shareBlob } from '@/platform/file-system';
import { useState } from 'react';

export function ExportMenu({
  target,
  filter,
  label = 'Exportar',
  size = 'sm',
}: {
  target: ExportOptions['target'];
  filter?: ExportOptions['filter'];
  label?: string;
  size?: 'sm' | 'md';
}) {
  const [busy, setBusy] = useState(false);

  const doExport = async (format: 'csv' | 'xlsx') => {
    setBusy(true);
    try {
      const { blob, filename } = await exportToFile({ target, format, filter });
      const shared = await shareBlob(blob, filename);
      if (!shared) await saveBlob(blob, filename);
      showToast({ title: `Exportado ${filename}`, variant: 'success' });
    } catch (e) {
      showToast({ title: 'Error al exportar', description: String(e), variant: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button size={size} variant="secondary" loading={busy} iconStart={<Download size={16} />}>
          {label}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="min-w-44 rounded-md border border-border bg-bg p-1 shadow-card"
        >
          <DropdownMenu.Item
            onSelect={() => void doExport('xlsx')}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-surface"
          >
            <FileSpreadsheet size={16} /> XLSX (Excel)
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => void doExport('csv')}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-surface"
          >
            <FileText size={16} /> CSV
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
