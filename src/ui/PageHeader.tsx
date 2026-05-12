import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  back,
  actions,
}: {
  title: ReactNode;
  back?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-3 pb-2 pt-3">
      {back && (
        <Link
          to={back}
          aria-label="Volver"
          className="-m-2 rounded p-2 text-muted hover:bg-surface2 hover:text-text"
        >
          <ChevronLeft size={22} />
        </Link>
      )}
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
      {actions}
    </div>
  );
}
