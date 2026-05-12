import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, Package, ScanLine, ArrowRightLeft, MoreHorizontal } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useActiveWarehouse } from '@/state/active-warehouse';
import { useEffect } from 'react';
import { ensurePersistentStorage } from '@/platform/storage';

interface Tab {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
  primary?: boolean;
}

const TABS: Tab[] = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/products', label: 'Productos', icon: Package },
  { to: '/scan', label: 'Escanear', icon: ScanLine, primary: true },
  { to: '/movements', label: 'Movim.', icon: ArrowRightLeft },
  { to: '/more', label: 'Más', icon: MoreHorizontal },
];

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { active, warehouses, setActiveId } = useActiveWarehouse();

  useEffect(() => {
    void ensurePersistentStorage();
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="safe-top sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => navigate('/warehouses')}
            className="min-w-0 flex-1 truncate rounded bg-surface px-3 py-2 text-left text-sm"
            aria-label="Almacén activo"
          >
            <span className="text-xs text-muted">Almacén</span>
            <div className="truncate font-medium">
              {active ? `${active.code} · ${active.name}` : warehouses.length === 0 ? 'Crear un almacén' : 'Seleccionar…'}
            </div>
          </button>
          {warehouses.length > 1 && (
            <select
              value={active?.id ?? ''}
              onChange={(e) => setActiveId(e.target.value)}
              className="h-11 rounded border border-border bg-surface px-2 text-sm"
              aria-label="Cambiar almacén"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 pb-24">
        <Outlet />
      </main>

      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur"
        aria-label="Navegación principal"
      >
        <ul className="mx-auto flex max-w-3xl items-stretch">
          {TABS.map(({ to, label, icon: Icon, end, primary }) => {
            const isActive = end
              ? location.pathname === to
              : location.pathname.startsWith(to);
            return (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  end={end}
                  className={cn(
                    'flex h-16 flex-col items-center justify-center gap-1 text-xs',
                    isActive ? 'text-primary' : 'text-muted',
                  )}
                >
                  <span
                    className={cn(
                      'flex items-center justify-center rounded-full',
                      primary
                        ? 'bg-primary text-primary-fg h-12 w-12 -mt-4 shadow-card'
                        : 'h-7 w-7',
                    )}
                  >
                    <Icon size={primary ? 26 : 22} aria-hidden />
                  </span>
                  <span>{label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
