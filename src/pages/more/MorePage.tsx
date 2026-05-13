import { Link } from 'react-router-dom';
import { PageHeader } from '@/ui/PageHeader';
import {
  Warehouse,
  Settings,
  Download,
  ChevronRight,
  ScanLine,
  BarChart3,
  ClipboardList,
  Smartphone,
  Shield,
  Activity,
} from 'lucide-react';

const ITEMS = [
  { to: '/warehouses', label: 'Almacenes', icon: Warehouse },
  { to: '/counts', label: 'Recuentos', icon: ClipboardList },
  { to: '/scan', label: 'Escáner', icon: ScanLine },
  { to: '/reports', label: 'Reportes', icon: BarChart3 },
  { to: '/sync', label: 'Sincronizar con otro dispositivo', icon: Smartphone },
  { to: '/more/backup', label: 'Backup / restaurar', icon: Download },
  { to: '/more/security', label: 'Seguridad', icon: Shield },
  { to: '/more/health', label: 'Salud de los datos', icon: Activity },
  { to: '/more/settings', label: 'Ajustes', icon: Settings },
];

export default function MorePage() {
  return (
    <>
      <PageHeader title="Más" />
      <ul className="divide-y divide-border">
        {ITEMS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link to={to} className="flex items-center gap-3 px-3 py-3.5 hover:bg-surface">
              <span className="text-muted">
                <Icon size={20} />
              </span>
              <span className="flex-1 font-medium">{label}</span>
              <ChevronRight size={18} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="px-3 pt-6 text-center text-xs text-muted">
        Inventek · todos los datos viven en este dispositivo.
      </div>
    </>
  );
}
