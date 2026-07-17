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

/** One spark's engagement snapshot for the public spark page (per-visitor, never cached). */
export async function sparkEngagementSnapshot(
  tx: Tx,
  sparkId: string,
  storeId: string,
  visitorId: string | null,
): Promise<{ fires: number; followers: number; viewer_reacted: boolean; viewer_follows: boolean }> {
  const params: unknown[] = [sparkId, storeId]
  let viewerCols = `false AS viewer_reacted, false AS viewer_follows`
  if (visitorId) {
    params.push(visitorId)
    viewerCols = `
      EXISTS (SELECT 1 FROM spark_reactions r WHERE r.spark_id = $1 AND r.visitor_id = $3) AS viewer_reacted,
      EXISTS (SELECT 1 FROM store_follows f WHERE f.store_id = $2 AND f.visitor_id = $3) AS viewer_follows`
  }
  const { rows } = await asClient(tx).query<{
    fires: number; followers: number; viewer_reacted: boolean; viewer_follows: boolean
  }>(
    `SELECT (SELECT count(*)::int FROM spark_reactions r2 WHERE r2.spark_id = $1) AS fires,
            (SELECT count(*)::int FROM store_follows f2 WHERE f2.store_id = $2) AS followers,
            ${viewerCols}`,
    params,
  )
  return rows[0]!
}

/**
 * One item of the living Home stream (Release 0.7): a deal, a spark, a store debut,
 * or a noteworthy new product — all existing domain facts, no new content types.
 */
export interface HomeFeedItem {
  type: 'deal' | 'spark' | 'store' | 'product'
  id: string
  /** deal headline / spark body */
  text: string
  story: string | null
  published_at: string
  store_handle: string
  store_name: string
  product_id: string | null
  product_title: string | null
  price_minor: number | null
  currency: string | null
  image_url: string | null
  image_alt: string | null
  fires: number
  viewer_reacted: boolean
  viewer_saved: boolean
  viewer_follows: boolean
  is_new: boolean
}

/**
 * The living Home stream: deals and sparks in ONE chronological query (UNION ALL over
 * the same visibility conjunctions the single-type feeds enforce). No ranking, no
 * personalization — recency is the product. `is_new` compares against the visitor's
 * last-visit watermark. Personal filters need an identity (empty worlds otherwise);
 * `saved` is deal-scoped by design (sparks have no save).
 */
export async function listHomeFeed(
  tx: Tx,
  opts: { visitorId: string | null; filter: FeedFilter; lastVisit: string | null; limit?: number },
): Promise<HomeFeedItem[]> {
  const visitor = opts.visitorId
  if (!visitor && opts.filter !== 'all') return []

  const limit = Math.min(opts.limit ?? 48, 48)
  const params: unknown[] = [limit, opts.lastVisit] // $2 nullable -> is_new false on first visit
  let v = ''
  if (visitor) { params.push(visitor); v = `$${params.length}` }

  const dealViewer = visitor
    ? `EXISTS (SELECT 1 FROM deal_reactions r WHERE r.deal_id = d.id AND r.visitor_id = ${v}) AS viewer_reacted,
       EXISTS (SELECT 1 FROM deal_saves sv WHERE sv.deal_id = d.id AND sv.visitor_id = ${v}) AS viewer_saved,
       EXISTS (SELECT 1 FROM store_follows f WHERE f.store_id = s.id AND f.visitor_id = ${v}) AS viewer_follows`
    : `false AS viewer_reacted, false AS viewer_saved, false AS viewer_follows`
  const sparkViewer = visitor
    ? `EXISTS (SELECT 1 FROM spark_reactions r WHERE r.spark_id = sp.id AND r.visitor_id = ${v}),
       false,
       EXISTS (SELECT 1 FROM store_follows f WHERE f.store_id = s.id AND f.visitor_id = ${v})`
    : `false, false, false`
  const dealFilter =
    opts.filter === 'saved'
      ? `AND EXISTS (SELECT 1 FROM deal_saves sv2 WHERE sv2.deal_id = d.id AND sv2.visitor_id = ${v})`
      : opts.filter === 'following'
        ? `AND EXISTS (SELECT 1 FROM store_follows f2 WHERE f2.store_id = s.id AND f2.visitor_id = ${v})`
        : ''
  const sparkFilter =
    opts.filter === 'following'
      ? `AND EXISTS (SELECT 1 FROM store_follows f2 WHERE f2.store_id = s.id AND f2.visitor_id = ${v})`
      : ''

  const dealBranch = `
       SELECT 'deal'::text AS type, d.id, d.headline AS text, d.story,
              d.published_at::text AS published_at, s.handle AS store_handle, s.name AS store_name,
              p.id AS product_id, p.title AS product_title,
              (SELECT min(vr.price_amount)::int FROM product_variants vr WHERE vr.price_amount > 0 AND vr.product_id = p.id) AS price_minor,
              (SELECT min(vr.price_currency) FROM product_variants vr WHERE vr.price_amount > 0 AND vr.product_id = p.id) AS currency,
              img.url AS image_url, img.alt_text AS image_alt,
              (SELECT count(*)::int FROM deal_reactions r2 WHERE r2.deal_id = d.id) AS fires,
              ${dealViewer},
              ($2::timestamptz IS NOT NULL AND d.published_at > $2::timestamptz) AS is_new,
              d.published_at AS sort_key
       FROM deals d
       JOIN listings l ON l.product_id = d.product_id AND l.channel_id = d.channel_id AND l.status = 'published'
       JOIN products p ON p.id = d.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
       JOIN stores s ON s.id = d.channel_id AND s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL
       LEFT JOIN LATERAL (
         SELECT ma.url, pm.alt_text FROM product_media pm
         JOIN media_assets ma ON ma.id = pm.media_id
         WHERE pm.product_id = p.id
         ORDER BY (pm.role = 'hero') DESC, pm.position ASC LIMIT 1
       ) img ON true
       WHERE d.status = 'published' ${dealFilter}`

  const sparkBranch = `
       SELECT 'spark'::text, sp.id, sp.body, NULL,
              sp.published_at::text, s.handle, s.name,
              NULL, NULL, NULL, NULL,
              ma.url, NULL,
              (SELECT count(*)::int FROM spark_reactions r2 WHERE r2.spark_id = sp.id),
              ${sparkViewer},
              ($2::timestamptz IS NOT NULL AND sp.published_at > $2::timestamptz),
              sp.published_at
       FROM sparks sp
       JOIN stores s ON s.id = sp.channel_id AND s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL
       LEFT JOIN media_assets ma ON ma.id = sp.media_id
       WHERE sp.status = 'published' ${sparkFilter}`

  const followViewer = visitor
    ? `false, false, EXISTS (SELECT 1 FROM store_follows f WHERE f.store_id = s.id AND f.visitor_id = ${v})`
    : `false, false, false`
  const followFilter = (alias: string) =>
    opts.filter === 'following'
      ? `AND EXISTS (SELECT 1 FROM store_follows f2 WHERE f2.store_id = ${alias}.id AND f2.visitor_id = ${v})`
      : ''

  // a store opening its doors IS store activity — the debut card (existing fact: published_at)
  const storeBranch = `
       SELECT 'store'::text, s.id, s.name, b.voice->>'tone',
              s.published_at::text, s.handle, s.name,
              NULL, NULL, NULL, NULL,
              NULL, NULL,
              0,
              ${followViewer},
              ($2::timestamptz IS NOT NULL AND s.published_at > $2::timestamptz),
              s.published_at
       FROM stores s
       LEFT JOIN brand_kits b ON b.owner_type = 'store' AND b.owner_id = s.id
       WHERE s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL
         AND s.published_at IS NOT NULL ${followFilter('s')}`

  // a NEW product on a shelf — noteworthy bar: it has a photo (full conjunction otherwise)
  const productBranch = `
       SELECT 'product'::text, p.id, p.title, NULL,
              l.published_at::text, s.handle, s.name,
              p.id, p.title,
              (SELECT min(vr.price_amount)::int FROM product_variants vr WHERE vr.price_amount > 0 AND vr.product_id = p.id),
              (SELECT min(vr.price_currency) FROM product_variants vr WHERE vr.price_amount > 0 AND vr.product_id = p.id),
              img.url, img.alt_text,
              0,
              ${followViewer},
              ($2::timestamptz IS NOT NULL AND l.published_at > $2::timestamptz),
              l.published_at
       FROM listings l
       JOIN products p ON p.id = l.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
       JOIN stores s ON s.id = l.channel_id AND s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL
       JOIN LATERAL (
         SELECT ma.url, pm.alt_text FROM product_media pm
         JOIN media_assets ma ON ma.id = pm.media_id
         WHERE pm.product_id = p.id
         ORDER BY (pm.role = 'hero') DESC, pm.position ASC LIMIT 1
       ) img ON true
       WHERE l.status = 'published' AND l.published_at IS NOT NULL ${followFilter('s')}`

  // 'saved' is deal-scoped by design (only deals are saveable) -> the other voices drop out
  const union = opts.filter === 'saved'
    ? dealBranch
    : [dealBranch, sparkBranch, storeBranch, productBranch].join('\n       UNION ALL\n')

  const { rows } = await asClient(tx).query<HomeFeedItem & { sort_key: string }>(
    `SELECT * FROM (${union}) stream
     ORDER BY sort_key DESC, id DESC
     LIMIT $1`,
    params,
  )
  return rows.map(({ sort_key: _key, ...item }) => item)
}

/** How many followed-store items landed since the watermark (the Following badge). */
export async function countNewForFollowing(tx: Tx, visitorId: string, lastVisit: string | null): Promise<number> {
  if (!lastVisit) return 0
  const { rows } = await asClient(tx).query<{ n: number }>(
    `SELECT (
       (SELECT count(*) FROM deals d
        JOIN listings l ON l.product_id = d.product_id AND l.channel_id = d.channel_id AND l.status = 'published'
        JOIN products p ON p.id = d.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
        JOIN stores s ON s.id = d.channel_id AND s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL
        WHERE d.status = 'published' AND d.published_at > $2::timestamptz
          AND EXISTS (SELECT 1 FROM store_follows f WHERE f.store_id = s.id AND f.visitor_id = $1))
       +
       (SELECT count(*) FROM sparks sp
        JOIN stores s ON s.id = sp.channel_id AND s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL
        WHERE sp.status = 'published' AND sp.published_at > $2::timestamptz
          AND EXISTS (SELECT 1 FROM store_follows f WHERE f.store_id = s.id AND f.visitor_id = $1))
       +
       (SELECT count(*) FROM listings l
        JOIN products p ON p.id = l.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
        JOIN stores s ON s.id = l.channel_id AND s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL
        WHERE l.status = 'published' AND l.published_at > $2::timestamptz
          AND EXISTS (SELECT 1 FROM product_media pm WHERE pm.product_id = p.id)
          AND EXISTS (SELECT 1 FROM store_follows f WHERE f.store_id = s.id AND f.visitor_id = $1))
     )::int AS n`,
    [visitorId, lastVisit])
  return Number(rows[0]!.n)
}
