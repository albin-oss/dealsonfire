/**
 * Catalog grid reads (IMP-COM-001B): direct tenant-scoped keyset queries — the D-13
 * reasoning applies (projection when analytics enrich the grid, Batch 8). Kept OUT of the
 * frozen ProductRepository contract: aggregate persistence and grid reads evolve on
 * different axes. Cursor = (updated_at, id) keyset via platform/pagination.
 */
import { PgRepositoryBase } from '../../../../platform/repository'
import type { Tx } from '../../../../platform/types'
import { type Page, buildPage, decodeCursor } from '../../../../platform/pagination'
import { type Result, ok } from '../../../../shared/result'
import type { DomainError } from '../../../../shared/errors'
import type { BusinessId } from '../../../merchant/shared-kernel/ids'
import type { ProductStatus } from '../domain/value-objects'

export interface ProductGridRow {
  id: string
  title: string
  status: ProductStatus
  fulfillment_kind: string
  category_path: string | null
  variant_count: number
  media_count: number
  min_price_amount: number | null
  price_currency: string | null
  updated_at: string
  /** Merchant language: is it on the store? (published listing on the queried channel) */
  on_store: boolean
}

export class PgProductReadDao extends PgRepositoryBase {
  async list(
    tx: Tx,
    businessId: BusinessId,
    opts: { status?: ProductStatus; showArchived?: boolean; q?: string; limit: number; cursor: string | null; channelId?: string | null },
  ): Promise<Result<Page<ProductGridRow>, DomainError>> {
    let cursorClause = ''
    const params: unknown[] = [businessId]
    // ACCEPTANCE-001 N1: the working set by default — archived only on request.
    let statusClause = ''
    if (opts.status) {
      params.push(opts.status)
      statusClause = `AND p.status = $${params.length}`
    } else if (!opts.showArchived) {
      statusClause = `AND p.status <> 'archived'`
    }
    // ACCEPTANCE-001 N4: simple title filter (trigram index when volume demands).
    let titleClause = ''
    if (opts.q) {
      params.push('%' + opts.q.replace(/[%_\\]/g, '\\$&') + '%')
      titleClause = `AND p.title ILIKE $${params.length}`
    }
    if (opts.cursor) {
      const decoded = decodeCursor(opts.cursor)
      if (!decoded.ok) return decoded
      const [updatedAt, id] = decoded.value
      params.push(updatedAt, id)
      cursorClause = `AND (p.updated_at, p.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`
    }
    // merchant language: "on your store" = a published listing on the queried channel
    let onStoreClause = 'false'
    if (opts.channelId) {
      params.push(opts.channelId)
      onStoreClause = `EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id AND l.channel_id = $${params.length} AND l.status = 'published')`
    }
    params.push(opts.limit + 1) // limit+1: the extra row IS the has-next signal

    // Cursor key uses PG's ::text representation (microsecond precision) — Date.toISOString()
    // truncates to milliseconds and would skip same-millisecond rows at page boundaries.
    const rows = await this.many<ProductGridRow>(
      tx,
      `SELECT p.id, p.title, p.status, p.fulfillment_kind, p.category_path,
              p.updated_at::text AS updated_at,
              ${onStoreClause} AS on_store,
              (SELECT count(*)::int FROM product_variants v WHERE v.product_id = p.id) AS variant_count,
              (SELECT count(*)::int FROM product_media m WHERE m.product_id = p.id) AS media_count,
              (SELECT min(v.price_amount)::int FROM product_variants v WHERE v.product_id = p.id) AS min_price_amount,
              (SELECT min(v.price_currency) FROM product_variants v WHERE v.product_id = p.id) AS price_currency
       FROM products p
       WHERE p.business_id = $1 AND p.deleted_at IS NULL ${statusClause} ${titleClause} ${cursorClause}
       ORDER BY p.updated_at DESC, p.id DESC
       LIMIT $${params.length}`,
      params,
    )
    return ok(buildPage(rows, opts.limit, (row) => [row.updated_at, row.id]))
  }

  /**
   * Public storefront shelf = LISTING TRUTH (VISIBILITY_CONTRACT §9). The interim
   * priced-⇒-public rule is retired (its reality was backfilled as explicit listings in
   * migration 0012). A product appears iff its listing on THIS channel is published and
   * the product itself is not archived/deleted — the read-side terms of the visibility
   * conjunction that live in commerce (store liveness/hold are checked by the caller,
   * which resolved a LIVE store to reach this shelf). Hard-capped, newest first.
   */
  async listPublicShelf(tx: Tx, businessId: BusinessId, channelId: string, limit = 12): Promise<Array<{
    id: string; title: string; min_price_amount: number | null; price_currency: string | null
  }>> {
    return this.many(
      tx,
      `SELECT p.id, p.title,
              (SELECT min(v.price_amount)::int FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS min_price_amount,
              (SELECT min(v.price_currency) FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS price_currency
       FROM listings l
       JOIN products p ON p.id = l.product_id
       WHERE l.channel_id = $2 AND l.status = 'published'
         AND p.business_id = $1 AND p.status <> 'archived' AND p.deleted_at IS NULL
       ORDER BY l.published_at DESC, p.id DESC
       LIMIT $3`,
      [businessId, channelId, Math.min(limit, 48)],
    )
  }

  /**
   * Public product page read (Release 0.2): ONE product, iff visible on this channel —
   * the same conjunction terms as the shelf (published listing ∧ product not archived).
   * Null = the caller masks to 404 (V6: hidden is indistinguishable from nonexistent).
   */
  async findPublicProduct(tx: Tx, businessId: BusinessId, channelId: string, productId: string): Promise<{
    id: string; title: string; description: { format?: string; content?: string } | null
    fulfillment_kind: string; min_price_amount: number | null; price_currency: string | null
  } | null> {
    const rows = await this.many<{
      id: string; title: string; description: { format?: string; content?: string } | null
      fulfillment_kind: string; min_price_amount: number | null; price_currency: string | null
    }>(
      tx,
      `SELECT p.id, p.title, p.description, p.fulfillment_kind,
              (SELECT min(v.price_amount)::int FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS min_price_amount,
              (SELECT min(v.price_currency) FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS price_currency
       FROM listings l
       JOIN products p ON p.id = l.product_id
       WHERE l.channel_id = $2 AND l.status = 'published' AND l.product_id = $3
         AND p.business_id = $1 AND p.status <> 'archived' AND p.deleted_at IS NULL`,
      [businessId, channelId, productId],
    )
    return rows[0] ?? null
  }
}
