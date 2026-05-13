import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';

const APP_NAME = 'Inventek';

export function PageHeader({
  title,
  back,
  actions,
}: {
  title: ReactNode;
  back?: string;
  actions?: ReactNode;
}) {
  // Keep document.title in sync for screen readers and browser history.
  useEffect(() => {
    const text = typeof title === 'string' ? title : '';
    document.title = text ? `${text} · ${APP_NAME}` : APP_NAME;
  }, [title]);

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
