/**
 * The public deals feed (Release 0.4) — COMPOSITION-ROOT read: the one place allowed to
 * compose across domain tables (deals/listings/products/media are commerce; stores and
 * store_follows are merchant), exactly like the publicStorefront/publicDeal composed
 * queries that precede it. Every row passes the FULL visibility conjunction
 * (VISIBILITY_CONTRACT §1) — deal published ∧ listing published ∧ product alive ∧ store
 * live without hold. Chronological, capped, no ranking (Release 0.4 is honest recency).
 * Viewer flags ride along when a visitor identity exists, so the response is per-visitor
 * and therefore NEVER shared-cacheable.
 */
import { asClient } from '@platform/db'
import type { Tx } from '@platform/types'

export interface FeedDeal {
  id: string
  headline: string
  story: string | null
  published_at: string
  store_handle: string
  store_name: string
  product_id: string
  product_title: string
  price_minor: number | null
  currency: string | null
  image_url: string | null
  image_alt: string | null
  fires: number
  viewer_reacted: boolean
  viewer_saved: boolean
  viewer_follows: boolean
}

export type FeedFilter = 'all' | 'saved' | 'following'

export async function listDealsFeed(
  tx: Tx,
  opts: { visitorId: string | null; filter: FeedFilter; limit?: number },
): Promise<FeedDeal[]> {
  const visitor = opts.visitorId
  // the personal filters are empty worlds without an identity — never an error
  if (!visitor && opts.filter !== 'all') return []

  const params: unknown[] = [Math.min(opts.limit ?? 48, 48)]
  let viewerCols = `false AS viewer_reacted, false AS viewer_saved, false AS viewer_follows`
  if (visitor) {
    params.push(visitor)
    viewerCols = `
      EXISTS (SELECT 1 FROM deal_reactions r WHERE r.deal_id = d.id AND r.visitor_id = $2) AS viewer_reacted,
      EXISTS (SELECT 1 FROM deal_saves sv WHERE sv.deal_id = d.id AND sv.visitor_id = $2) AS viewer_saved,
      EXISTS (SELECT 1 FROM store_follows f WHERE f.store_id = s.id AND f.visitor_id = $2) AS viewer_follows`
  }
  const filterClause =
    opts.filter === 'saved'
      ? `AND EXISTS (SELECT 1 FROM deal_saves sv2 WHERE sv2.deal_id = d.id AND sv2.visitor_id = $2)`
      : opts.filter === 'following'
        ? `AND EXISTS (SELECT 1 FROM store_follows f2 WHERE f2.store_id = s.id AND f2.visitor_id = $2)`
        : ''

  const { rows } = await asClient(tx).query<FeedDeal>(
    `SELECT d.id, d.headline, d.story, d.published_at::text AS published_at,
            s.handle AS store_handle, s.name AS store_name,
            p.id AS product_id, p.title AS product_title,
            (SELECT min(v.price_amount)::int FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS price_minor,
            (SELECT min(v.price_currency) FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS currency,
            img.url AS image_url, img.alt_text AS image_alt,
            (SELECT count(*)::int FROM deal_reactions r2 WHERE r2.deal_id = d.id) AS fires,
            ${viewerCols}
     FROM deals d
     JOIN listings l ON l.product_id = d.product_id AND l.channel_id = d.channel_id AND l.status = 'published'
     JOIN products p ON p.id = d.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
     JOIN stores s ON s.id = d.channel_id AND s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL
     LEFT JOIN LATERAL (
       SELECT ma.url, pm.alt_text FROM product_media pm
       JOIN media_assets ma ON ma.id = pm.media_id
       WHERE pm.product_id = p.id
       ORDER BY (pm.role = 'hero') DESC, pm.position ASC
       LIMIT 1
     ) img ON true
     WHERE d.status = 'published' ${filterClause}
     ORDER BY d.published_at DESC, d.id DESC
     LIMIT $1`,
    params,
  )
  return rows
}

/** One deal's engagement snapshot for the public deal page (per-visitor, never cached). */
export async function dealEngagementSnapshot(
  tx: Tx,
  dealId: string,
  storeId: string,
  visitorId: string | null,
): Promise<{ fires: number; saves: number; followers: number; viewer_reacted: boolean; viewer_saved: boolean; viewer_follows: boolean }> {
  const params: unknown[] = [dealId, storeId]
  let viewerCols = `false AS viewer_reacted, false AS viewer_saved, false AS viewer_follows`
  if (visitorId) {
    params.push(visitorId)
    viewerCols = `
      EXISTS (SELECT 1 FROM deal_reactions r WHERE r.deal_id = $1 AND r.visitor_id = $3) AS viewer_reacted,
      EXISTS (SELECT 1 FROM deal_saves sv WHERE sv.deal_id = $1 AND sv.visitor_id = $3) AS viewer_saved,
      EXISTS (SELECT 1 FROM store_follows f WHERE f.store_id = $2 AND f.visitor_id = $3) AS viewer_follows`
  }
  const { rows } = await asClient(tx).query<{
    fires: number; saves: number; followers: number
    viewer_reacted: boolean; viewer_saved: boolean; viewer_follows: boolean
  }>(
    `SELECT (SELECT count(*)::int FROM deal_reactions r2 WHERE r2.deal_id = $1) AS fires,
            (SELECT count(*)::int FROM deal_saves sv2 WHERE sv2.deal_id = $1) AS saves,
            (SELECT count(*)::int FROM store_follows f2 WHERE f2.store_id = $2) AS followers,
            ${viewerCols}`,
    params,
  )
  return rows[0]!
}

/** Store liveness on merchant terms — the caller's half of the engagement conjunction. */
export async function isStoreLive(tx: Tx, storeId: string): Promise<boolean> {
  const { rows } = await asClient(tx).query(
    `SELECT 1 FROM stores WHERE id = $1 AND status = 'live' AND enforcement_hold = 'none' AND deleted_at IS NULL`,
    [storeId])
  return rows.length > 0
}
