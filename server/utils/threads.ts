/**
 * Threads between things (LS-5) — one interesting thing naturally leads to
 * another. NOT a recommendation engine: every thread is an EXPLAINABLE
 * relationship a buyer could re-derive, and the heading says why it's there.
 *
 * Two threads ship (the two structural dead-ends):
 *  - VOICE: the maker's latest published words — thing → person → story.
 *    Amazon connects product → substitute; DOF connects product → human.
 *  - NEARBY: other makers' things from the same lane (LS-3 shared geography;
 *    "same part of the street", never "the algorithm thinks"). Cross-merchant
 *    by construction: the subject's own store is excluded, and diversity is
 *    a hard rule (one item per store, max three stores).
 *
 * Laws: the visibility conjunction is repeated per query (a held store can
 * appear in NO thread); sparse worlds return absent threads, never filler;
 * everything is deterministic (registry order, newest first); rejected for
 * LS-5 by admission law: shared-search-intent threads (sample too small),
 * follow-graph threads (no real distinct-person volume — seeded relationships
 * must never fake a social signal), any embedding/similarity inference.
 */
import type { Tx } from '@platform/types'
import { asClient } from '@platform/db'
import { LANES } from '@contracts/discovery/lanes'

import { effectivePriceSql } from '@domains/commerce/pricing/effective-price'
const LIVE = `s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL`
// verbatim twin of the 0032 product index expression (street-search.ts)
const V_PRODUCT = `(setweight(to_tsvector('english', p.title), 'A') ||
                   setweight(to_tsvector('english', coalesce(p.description->>'content', '')), 'B'))`

const NEARBY_LIMIT = 3 // three strong doors beat twenty weak cards

export interface ThreadVoice {
  spark_id: string; excerpt: string; store_handle: string; store_name: string; published_at: string
}
export interface ThreadNeighbor {
  product_id: string; title: string; price_minor: number | null; currency: string | null
  store_handle: string; store_name: string; image_url: string | null
}
export interface Threads {
  /** The maker's own words — absent when the maker hasn't spoken. */
  voice: ThreadVoice | null
  /** Other makers, same lane. Absent when the lane has no honest neighbors. */
  nearby: { lane_id: string; lane_title: string; items: ThreadNeighbor[] } | null
}

/** The subject's product id — threads hang off the thing's words and maker. */
async function resolveProduct(tx: Tx, subjectType: 'product' | 'deal', subjectId: string):
  Promise<{ productId: string; storeId: string } | null> {
  const client = asClient(tx)
  if (subjectType === 'product') {
    const { rows } = await client.query<{ product_id: string; store_id: string }>(
      `SELECT l.product_id, l.channel_id AS store_id
       FROM listings l
       JOIN products p ON p.id = l.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
       JOIN stores s ON s.id = l.channel_id AND ${LIVE}
       WHERE l.product_id = $1 AND l.status = 'published' LIMIT 1`, [subjectId])
    return rows[0] ? { productId: rows[0].product_id, storeId: rows[0].store_id } : null
  }
  const { rows } = await client.query<{ product_id: string; store_id: string }>(
    `SELECT d.product_id, d.channel_id AS store_id
     FROM deals d
     JOIN listings l ON l.product_id = d.product_id AND l.channel_id = d.channel_id AND l.status = 'published'
     JOIN stores s ON s.id = d.channel_id AND ${LIVE}
     WHERE d.id = $1 AND d.status = 'published' LIMIT 1`, [subjectId])
  return rows[0] ? { productId: rows[0].product_id, storeId: rows[0].store_id } : null
}

export async function threadsFor(tx: Tx, subjectType: 'product' | 'deal', subjectId: string): Promise<Threads> {
  const client = asClient(tx)
  const subject = await resolveProduct(tx, subjectType, subjectId)
  if (!subject) return { voice: null, nearby: null } // invisible subjects thread to nothing

  // ——— VOICE: the maker's latest published words
  const { rows: voiceRows } = await client.query<ThreadVoice>(
    `SELECT sp.id AS spark_id, left(sp.body, 160) AS excerpt,
            s.handle AS store_handle, s.name AS store_name, sp.published_at::text AS published_at
     FROM sparks sp JOIN stores s ON s.id = sp.channel_id AND ${LIVE}
     WHERE sp.channel_id = $1 AND sp.status = 'published'
     ORDER BY sp.published_at DESC LIMIT 1`, [subject.storeId])
  const voice = voiceRows[0] ?? null

  // ——— NEARBY: which part of the street is this thing from? First registered
  // search lane whose words match the subject's own words (deterministic).
  let nearby: Threads['nearby'] = null
  for (const lane of LANES.filter((l) => l.kind === 'search')) {
    const { rows: inLane } = await client.query(
      `SELECT 1 FROM products p WHERE p.id = $1 AND ${V_PRODUCT} @@ websearch_to_tsquery('english', $2)`,
      [subject.productId, lane.q])
    if (inLane.length === 0) continue
    // other makers' things from this lane: one per store, newest first
    const { rows: items } = await client.query<ThreadNeighbor & { published_at: string }>(
      `SELECT DISTINCT ON (s.id)
              p.id AS product_id, p.title,
              (SELECT min(${effectivePriceSql('v')})::int FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS price_minor,
              (SELECT min(v.price_currency) FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS currency,
              s.handle AS store_handle, s.name AS store_name, img.url AS image_url,
              l.published_at
       FROM listings l
       JOIN products p ON p.id = l.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
       JOIN stores s ON s.id = l.channel_id AND ${LIVE}
       LEFT JOIN LATERAL (
         SELECT ma.url FROM product_media pm JOIN media_assets ma ON ma.id = pm.media_id
         WHERE pm.product_id = p.id ORDER BY (pm.role = 'hero') DESC, pm.position ASC LIMIT 1
       ) img ON true
       WHERE l.status = 'published' AND s.id <> $1
         AND ${V_PRODUCT} @@ websearch_to_tsquery('english', $2)
       ORDER BY s.id, l.published_at DESC`, [subject.storeId, lane.q])
    if (items.length > 0) {
      const trimmed = items
        .sort((a, b) => (a.published_at < b.published_at ? 1 : -1))
        .slice(0, NEARBY_LIMIT)
        .map(({ published_at: _p, ...rest }) => rest)
      nearby = { lane_id: lane.id, lane_title: lane.title, items: trimmed }
    }
    break // first matching lane wins, with or without neighbors — deterministic
  }

  return { voice, nearby }
}
