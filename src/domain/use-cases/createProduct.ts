import { db } from '@/data/db';
import { newId } from '@/utils/ulid';
import { nowIso } from '@/utils/format';
import { err, ok, type Result } from '@/utils/result';
import { productInputSchema, type ProductInput } from '../schemas';
import type { Product } from '../entities';

export async function createProduct(input: ProductInput): Promise<Result<Product>> {
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) {
    return err({ kind: 'validation', message: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const data = parsed.data;
  try {
    return await db.transaction('rw', db.products, async () => {
      const dup = await db.products.where('sku').equalsIgnoreCase(data.sku).first();
      if (dup && !dup.deletedAt) {
        return err({ kind: 'conflict', message: `Ya existe un producto con SKU "${data.sku}"` });
      }
      // Conflict on barcodes (active products only)
      for (const code of data.barcodes) {
        const found = await db.products.where('barcodes').equals(code).first();
        if (found && !found.deletedAt) {
          return err({
            kind: 'conflict',
            message: `El código "${code}" ya pertenece al producto "${found.name}"`,
          });
        }
      }
      const now = nowIso();
      const product: Product = {
        id: newId(),
        sku: data.sku,
        name: data.name,
        description: data.description,
        categoryId: data.categoryId ?? null,
        supplierId: data.supplierId ?? null,
        barcodes: data.barcodes ?? [],
        unit: data.unit,
        costPrice: data.costPrice,
        salePrice: data.salePrice,
        taxRate: data.taxRate,
        active: data.active,
        createdAt: now,
        updatedAt: now,
      };
      await db.products.put(product);
      return ok(product);
    });
  } catch (cause) {
    return err({ kind: 'storage-failure', cause });
  }
}

export async function updateProduct(
  id: string,
  patch: Partial<ProductInput>,
): Promise<Result<Product>> {
  try {
    return await db.transaction('rw', db.products, async () => {
      const existing = await db.products.get(id);
      if (!existing || existing.deletedAt) {
        return err({ kind: 'not-found', entity: 'product', id });
      }
      const next = { ...existing, ...patch, id, updatedAt: nowIso() } as Product;
      const parsed = productInputSchema.safeParse(next);
      if (!parsed.success) {
        return err({ kind: 'validation', message: 'Datos inválidos', details: parsed.error.flatten() });
      }
      if (patch.sku && patch.sku !== existing.sku) {
        const dup = await db.products.where('sku').equalsIgnoreCase(patch.sku).first();
        if (dup && dup.id !== id && !dup.deletedAt) {
          return err({ kind: 'conflict', message: `Ya existe un producto con SKU "${patch.sku}"` });
        }
      }
      await db.products.put(next);
      return ok(next);
    });
  } catch (cause) {
    return err({ kind: 'storage-failure', cause });
  }
}
