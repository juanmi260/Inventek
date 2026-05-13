import { db } from '@/data/db';
import type { Movement, MovementLine, Product, Warehouse } from '@/domain/entities';
import { toCsvBlob, toXlsxBlob, timestampedName, type Row } from '@/platform/sheets';

async function productRows(): Promise<Row[]> {
  const products = await db.products.filter((p) => !p.deletedAt).toArray();
  return products.map((p) => ({
    id: p.id,
    sku: p.sku,
    nombre: p.name,
    descripcion: p.description ?? '',
    unidad: p.unit,
    codigos_barras: p.barcodes.join(' | '),
    precio_coste: p.costPrice ?? '',
    precio_venta: p.salePrice ?? '',
    iva: p.taxRate ?? '',
    activo: p.active,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  }));
}

async function stockRows(): Promise<Row[]> {
  const [levels, warehouses, products] = await Promise.all([
    db.stockLevels.toArray(),
    db.warehouses.toArray() as Promise<Warehouse[]>,
    db.products.toArray() as Promise<Product[]>,
  ]);
  const wMap = new Map(warehouses.map((w) => [w.id, w]));
  const pMap = new Map(products.map((p) => [p.id, p]));
  return levels
    .map((l) => {
      const w = wMap.get(l.warehouseId);
      const p = pMap.get(l.productId);
      return {
        almacen_codigo: w?.code ?? '',
        almacen_nombre: w?.name ?? '',
        sku: p?.sku ?? '',
        producto: p?.name ?? '',
        cantidad: l.quantity,
        min: l.minStock ?? '',
        max: l.maxStock ?? '',
        ubicacion: l.location ?? '',
        precio_coste: p?.costPrice ?? '',
        valor_coste: p?.costPrice != null ? l.quantity * p.costPrice : '',
        precio_venta: p?.salePrice ?? '',
        valor_venta: p?.salePrice != null ? l.quantity * p.salePrice : '',
        updated_at: l.updatedAt,
      } as Row;
    })
    .sort((a, b) =>
      String(a.almacen_codigo).localeCompare(String(b.almacen_codigo)) ||
      String(a.producto).localeCompare(String(b.producto)),
    );
}

async function movementRows(opts: {
  warehouseId?: string;
  type?: Movement['type'];
  from?: string;
  to?: string;
} = {}): Promise<Row[]> {
  const movements = await db.movements.orderBy('occurredAt').reverse().toArray();
  const filtered = movements.filter((m) => {
    if (opts.type && m.type !== opts.type) return false;
    if (opts.warehouseId && m.warehouseId !== opts.warehouseId && m.destinationWarehouseId !== opts.warehouseId) return false;
    if (opts.from && m.occurredAt < opts.from) return false;
    if (opts.to && m.occurredAt > opts.to) return false;
    return true;
  });

  const allLines = await db.movementLines.toArray();
  const linesByMov = new Map<string, MovementLine[]>();
  for (const l of allLines) {
    const arr = linesByMov.get(l.movementId) ?? [];
    arr.push(l);
    linesByMov.set(l.movementId, arr);
  }

  const [warehouses, products] = await Promise.all([
    db.warehouses.toArray() as Promise<Warehouse[]>,
    db.products.toArray() as Promise<Product[]>,
  ]);
  const wMap = new Map(warehouses.map((w) => [w.id, w]));
  const pMap = new Map(products.map((p) => [p.id, p]));

  const rows: Row[] = [];
  for (const m of filtered) {
    const lines = linesByMov.get(m.id) ?? [];
    for (const l of lines) {
      const p = pMap.get(l.productId);
      rows.push({
        fecha: m.occurredAt,
        tipo: m.type,
        motivo: m.reason,
        almacen: wMap.get(m.warehouseId ?? '')?.code ?? '',
        destino: wMap.get(m.destinationWarehouseId ?? '')?.code ?? '',
        sku: p?.sku ?? '',
        producto: p?.name ?? '',
        cantidad: l.quantity,
        coste_unitario: l.unitCost ?? '',
        documento: m.documentRef ?? '',
        notas: m.notes ?? '',
        movement_id: m.id,
      });
    }
  }
  return rows;
}

export type ExportTarget = 'catalog' | 'stock' | 'movements';
export type ExportFormat = 'csv' | 'xlsx';

export interface ExportOptions {
  target: ExportTarget;
  format: ExportFormat;
  filter?: {
    warehouseId?: string;
    type?: Movement['type'];
    from?: string;
    to?: string;
  };
}

export async function exportToFile(opts: ExportOptions): Promise<{ blob: Blob; filename: string }> {
  let rows: Row[] = [];
  let prefix = 'inventek';
  if (opts.target === 'catalog') {
    rows = await productRows();
    prefix = 'inventek-catalogo';
  } else if (opts.target === 'stock') {
    rows = await stockRows();
    prefix = 'inventek-stock';
  } else if (opts.target === 'movements') {
    rows = await movementRows(opts.filter ?? {});
    prefix = 'inventek-movimientos';
  }

  if (opts.format === 'csv') {
    return { blob: toCsvBlob(rows), filename: timestampedName(prefix, 'csv') };
  }
  return {
    blob: toXlsxBlob([{ name: opts.target, rows }]),
    filename: timestampedName(prefix, 'xlsx'),
  };
}

/**
 * Convenience: exports stock + movements + catalog in one workbook with three sheets.
 */
export async function exportFullWorkbook(): Promise<{ blob: Blob; filename: string }> {
  const [catalog, stock, movements] = await Promise.all([
    productRows(),
    stockRows(),
    movementRows({}),
  ]);
  const blob = toXlsxBlob([
    { name: 'Catálogo', rows: catalog },
    { name: 'Stock', rows: stock },
    { name: 'Movimientos', rows: movements },
  ]);
  return { blob, filename: timestampedName('inventek-completo', 'xlsx') };
}
