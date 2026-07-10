/**
 * PgProductRepository (IMP-COM-001B) — whole-aggregate persistence against the contract
 * frozen in domain/ports.ts. Children (variants, media) are REPLACED on save (BLUEPRINT §3:
 * "the repository diffs/replaces children; callers never partial-write") — ids are stable
 * across replacement, so external references survive. Optimistic concurrency is the kernel
 * pattern: `forUpdate` row lock + the event store's per-aggregate sequence guard.
 * Rehydration guard (ADR-004 rule 23): a row set that fails the aggregate validator is
 * corruption — it throws InfrastructureError loudly instead of resurrecting a broken product.
 */
import { InfrastructureError, domainError } from '../../../../shared/errors'
import { unwrap } from '../../../../shared/result'
import { PgRepositoryBase } from '../../../../platform/repository'
import type { Tx } from '../../../../platform/types'
import type { BusinessId } from '../../../merchant/shared-kernel/ids'
import { asBusinessId } from '../../../merchant/shared-kernel/ids'
import { createPrice } from '../../../merchant/shared-kernel/price'
import type { AIProvenance } from '../../../merchant/shared-kernel/ai-provenance'
import type { Option } from '../../shared-kernel/option'
import { asProductId, asVariantId, asProductMediaId, type ProductId } from '../../shared-kernel/ids'
import type { ProductRepository } from '../domain/ports'
import { Product } from '../domain/product'
import { Variant, type Sku, type SaleWindow } from '../domain/variant'
import { ProductMedia, type MediaRole } from '../domain/product-media'
import { validateProduct } from '../domain/product-validator'
import type { ProductTitle, ProductDescription, CategoryReference, ProductStatus, FulfillmentKind } from '../domain/value-objects'
import { createMediaRef } from '../../../merchant/shared-kernel/media-ref'

interface ProductRow {
  id: string
  business_id: string
  title: string
  description: ProductDescription | null
  fulfillment_kind: FulfillmentKind
  category_path: string | null
  attributes: Record<string, unknown>
  options: Option[]
  status: ProductStatus
  ai_provenance: AIProvenance
}

interface VariantRow {
  id: string
  sku: string
  option_values: Record<string, string>
  price_amount: string
  price_currency: string
  sale_amount: string | null
  sale_starts_at: Date | null
  sale_ends_at: Date | null
  kind_data: Record<string, unknown> | null
  position: number
}

interface MediaRow {
  id: string
  media_id: string
  render_variant: string | null
  variant_id: string | null
  role: MediaRole
  alt_text: string | null
  position: number
}

const PRODUCT_COLUMNS = 'id, business_id, title, description, fulfillment_kind, category_path, attributes, options, status, ai_provenance'

export class PgProductRepository extends PgRepositoryBase implements ProductRepository {
  async findById(tx: Tx, id: ProductId, opts?: { forUpdate?: boolean }): Promise<Product | null> {
    const row = await this.maybeOne<ProductRow>(
      tx,
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1 AND deleted_at IS NULL${opts?.forUpdate ? ' FOR UPDATE' : ''}`,
      [id],
    )
    if (!row) return null
    const variants = await this.many<VariantRow>(
      tx,
      `SELECT id, sku, option_values, price_amount::text, price_currency, sale_amount::text,
              sale_starts_at, sale_ends_at, kind_data, position
       FROM product_variants WHERE product_id = $1 ORDER BY position`,
      [id],
    )
    const media = await this.many<MediaRow>(
      tx,
      `SELECT id, media_id, render_variant, variant_id, role, alt_text, position
       FROM product_media WHERE product_id = $1 ORDER BY position`,
      [id],
    )
    return this.rehydrate(row, variants, media)
  }

  private rehydrate(row: ProductRow, variantRows: VariantRow[], mediaRows: MediaRow[]): Product {
    const product = Product.rehydrate({
      id: asProductId(row.id),
      businessId: asBusinessId(row.business_id),
      title: row.title as ProductTitle,
      description: row.description,
      fulfillmentKind: row.fulfillment_kind,
      categoryRef: (row.category_path as CategoryReference | null),
      attributes: row.attributes,
      options: row.options,
      variants: variantRows.map((v) => {
        const sale: SaleWindow | null =
          v.sale_amount !== null && v.sale_starts_at && v.sale_ends_at
            ? { amount: Number(v.sale_amount), startsAt: v.sale_starts_at, endsAt: v.sale_ends_at }
            : null
        return Variant.rehydrate({
          id: asVariantId(v.id),
          sku: v.sku as Sku,
          optionValues: v.option_values,
          price: unwrap(createPrice(Number(v.price_amount), v.price_currency.trim())),
          sale,
          kindData: v.kind_data,
          position: v.position,
        })
      }),
      media: mediaRows.map((m) =>
        ProductMedia.rehydrate({
          id: asProductMediaId(m.id),
          media: unwrap(createMediaRef(m.media_id, m.render_variant ?? undefined)),
          variantId: m.variant_id ? asVariantId(m.variant_id) : null,
          role: m.role,
          altText: m.alt_text,
          position: m.position,
        })),
      status: row.status,
      aiProvenance: row.ai_provenance,
    })
    // Rehydration guard (ADR-004 rule 23): corrupt rows fail LOUDLY, never resurrect.
    const violations = validateProduct(product)
    if (violations.length > 0) {
      throw new InfrastructureError(
        `corrupt products row ${row.id}: ${violations.map((v) => v.message).join('; ')}`,
        { retryable: false },
      )
    }
    return product
  }

  async insert(tx: Tx, product: Product): Promise<void> {
    await this.client(tx).query(
      `INSERT INTO products (id, business_id, title, description, fulfillment_kind, category_path, attributes, options, status, ai_provenance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [product.id, product.businessId, product.title, product.description, product.fulfillmentKind,
       product.categoryRef, product.attributes, JSON.stringify(product.options), product.status, product.aiProvenance],
    )
    await this.insertChildren(tx, product)
  }

  async update(tx: Tx, product: Product): Promise<void> {
    await this.client(tx).query(
      `UPDATE products SET title = $2, description = $3, category_path = $4, attributes = $5,
         options = $6, status = $7, ai_provenance = $8
       WHERE id = $1`,
      [product.id, product.title, product.description, product.categoryRef, product.attributes,
       JSON.stringify(product.options), product.status, product.aiProvenance],
    )
    // Replace children (BLUEPRINT §3). Media first (FK → variants), same ids re-inserted.
    await this.client(tx).query('DELETE FROM product_media WHERE product_id = $1', [product.id])
    await this.client(tx).query('DELETE FROM product_variants WHERE product_id = $1', [product.id])
    await this.insertChildren(tx, product)
  }

  private async insertChildren(tx: Tx, product: Product): Promise<void> {
    for (const variant of product.variants) {
      try {
        await this.insertVariant(tx, product, variant)
      } catch (error) {
        // ACCEPTANCE-001 C1: the business-wide SKU unique constraint is a NORMAL merchant
        // conflict, never a 500. Translate 23505 into an educational SKU_TAKEN (D-31).
        const pg = error as { code?: string; constraint?: string }
        if (pg.code === '23505' && pg.constraint === 'uq_variants_business_sku') {
          throw domainError('SKU_TAKEN',
            `SKU "${variant.sku}" is already used by another product in this business — choose a different SKU, or leave it blank to auto-generate one.`,
            { sku: variant.sku })
        }
        throw error
      }
    }
    for (const item of product.media) {
      await this.client(tx).query(
        `INSERT INTO product_media (id, product_id, business_id, media_id, render_variant, variant_id, role, alt_text, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [item.id, product.id, product.businessId, item.media.mediaId, item.media.variant ?? null,
         item.variantId, item.role, item.altText, item.position],
      )
    }
  }

  private async insertVariant(tx: Tx, product: Product, variant: Product['variants'][number]): Promise<void> {
    await this.client(tx).query(
        `INSERT INTO product_variants
           (id, product_id, business_id, sku, option_values, price_amount, price_currency,
            sale_amount, sale_starts_at, sale_ends_at, kind_data, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [variant.id, product.id, product.businessId, variant.sku, variant.optionValues,
         variant.price.amount, variant.price.currency,
         variant.sale?.amount ?? null, variant.sale?.startsAt ?? null, variant.sale?.endsAt ?? null,
         variant.kindData, variant.position],
      )
  }

  async countActiveByBusiness(tx: Tx, businessId: BusinessId): Promise<number> {
    return this.count(
      tx,
      `SELECT count(*)::text AS count FROM products
       WHERE business_id = $1 AND status <> 'archived' AND deleted_at IS NULL`,
      [businessId],
    )
  }
}
