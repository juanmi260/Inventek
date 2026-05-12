import { Link } from 'react-router-dom';
import { PageHeader } from '@/ui/PageHeader';
import { Warehouse, Settings, Download, ChevronRight, ScanLine } from 'lucide-react';

const ITEMS = [
  { to: '/warehouses', label: 'Almacenes', icon: Warehouse },
  { to: '/scan', label: 'Escáner', icon: ScanLine },
  { to: '/more/backup', label: 'Backup / restaurar', icon: Download },
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
