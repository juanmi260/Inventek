import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  side?: 'bottom' | 'right';
}

export function Sheet({ open, onOpenChange, title, description, children, side = 'bottom' }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 animate-fade-in" />
        <Dialog.Content
          className={cn(
            'fixed z-50 bg-bg shadow-card outline-none',
            side === 'bottom'
              ? 'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-lg animate-sheet-in safe-bottom'
              : 'inset-y-0 right-0 max-w-md w-full',
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border p-4">
            <div className="min-w-0 flex-1">
              {title && (
                <Dialog.Title className="truncate text-lg font-semibold">{title}</Dialog.Title>
              )}
              {description && (
                <Dialog.Description className="mt-0.5 text-sm text-muted">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Cerrar"
              className="-m-2 rounded p-2 text-muted hover:bg-surface2 hover:text-text"
            >
              <X size={20} />
            </Dialog.Close>
          </div>
          <div className="max-h-[calc(90dvh-3.5rem)] overflow-y-auto p-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
