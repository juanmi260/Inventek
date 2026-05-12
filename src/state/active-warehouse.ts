import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/data/db';
import { settingsRepo } from '@/data/repositories';
import type { Warehouse } from '@/domain/entities';

const ACTIVE_KEY = 'activeWarehouseId';

export function useActiveWarehouse() {
  const warehouses = useLiveQuery(
    () => db.warehouses.filter((w) => !w.deletedAt && !w.archived).toArray(),
    [],
    [] as Warehouse[],
  );

  const [activeId, setActiveIdState] = useState<string | null>(null);

  useEffect(() => {
    void settingsRepo.get<string>(ACTIVE_KEY).then((id) => {
      if (id) setActiveIdState(id);
    });
  }, []);

  const setActiveId = (id: string) => {
    setActiveIdState(id);
    void settingsRepo.set(ACTIVE_KEY, id);
  };

  const active = useMemo(() => {
    if (!warehouses || warehouses.length === 0) return undefined;
    return (
      warehouses.find((w) => w.id === activeId) ??
      warehouses.find((w) => w.isDefault) ??
      warehouses[0]
    );
  }, [warehouses, activeId]);

  useEffect(() => {
    if (active && active.id !== activeId) setActiveIdState(active.id);
  }, [active, activeId]);

  return {
    warehouses: warehouses ?? [],
    active,
    setActiveId,
  };
}
