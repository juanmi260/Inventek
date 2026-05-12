import { z } from 'zod';

export const warehouseInputSchema = z.object({
  code: z.string().trim().min(1, 'Código requerido').max(16),
  name: z.string().trim().min(1, 'Nombre requerido').max(120),
  address: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().optional(),
  isDefault: z.boolean().default(false),
  archived: z.boolean().default(false),
});
export type WarehouseInput = z.infer<typeof warehouseInputSchema>;

export const productInputSchema = z.object({
  sku: z.string().trim().min(1, 'SKU requerido').max(64),
  name: z.string().trim().min(1, 'Nombre requerido').max(200),
  description: z.string().trim().max(2000).optional(),
  categoryId: z.string().nullable().optional(),
  supplierId: z.string().nullable().optional(),
  barcodes: z.array(z.string().trim().min(1)).default([]),
  unit: z.string().default('unit'),
  costPrice: z.number().nonnegative().optional(),
  salePrice: z.number().nonnegative().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  active: z.boolean().default(true),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const movementLineInputSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive('Cantidad debe ser positiva'),
  unitCost: z.number().nonnegative().optional(),
  notes: z.string().max(500).optional(),
});
export type MovementLineInput = z.infer<typeof movementLineInputSchema>;

export const movementInputSchema = z
  .object({
    type: z.enum(['in', 'out', 'transfer', 'adjust']),
    occurredAt: z.string().optional(),
    warehouseId: z.string().optional(),
    destinationWarehouseId: z.string().optional(),
    reason: z.string().min(1, 'Motivo requerido'),
    notes: z.string().max(2000).optional(),
    userId: z.string().optional(),
    documentRef: z.string().max(120).optional(),
    lines: z.array(movementLineInputSchema).min(1, 'Al menos una línea'),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'transfer') {
      if (!val.warehouseId)
        ctx.addIssue({ code: 'custom', path: ['warehouseId'], message: 'Origen requerido' });
      if (!val.destinationWarehouseId)
        ctx.addIssue({
          code: 'custom',
          path: ['destinationWarehouseId'],
          message: 'Destino requerido',
        });
      if (
        val.warehouseId &&
        val.destinationWarehouseId &&
        val.warehouseId === val.destinationWarehouseId
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['destinationWarehouseId'],
          message: 'Origen y destino deben ser distintos',
        });
      }
    } else {
      if (!val.warehouseId)
        ctx.addIssue({ code: 'custom', path: ['warehouseId'], message: 'Almacén requerido' });
    }
  });
export type MovementInput = z.infer<typeof movementInputSchema>;
