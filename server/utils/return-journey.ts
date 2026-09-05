/**
 * The return journey (LS-6) — the street remembers what changed while you were away.
 *
 * NOT retention machinery: the summary is a pure read over authoritative facts
 * (follows + publication timestamps + the existing last-visit watermark), and
 * it only ever reports things that GENUINELY happened since the visitor was
 * last here. No new table, no notification store, no inbox, no ranking-as-
 * relevance. Explicit relationships dominate: "from people you follow" is the
 * whole point — a follow you made is the reason a change is worth surfacing.
 *
 * "New to me" means, concretely: published after `lastVisit`, from a store
 * this visitor FOLLOWS, still visible under the enforcement law. Nothing is
 * inferred; nothing is called new because ranking resurfaced it; ancient
 * content can never appear.
 *
 * Sparks lead by design — a maker's voice changes more often than their
 * shelf, and a new Spark from a followed maker is the strongest honest reason
 * to return. Empty groups are omitted; an all-empty return is the caller's
 * cue to fall through to the shared Street rather than fake liveliness.
 */
import type { Tx } from '@platform/types'
import { asClient } from '@platform/db'

import { effectivePriceSql } from '@domains/commerce/pricing/effective-price'
const LIVE = `s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL`
const FOLLOWS = `EXISTS (SELECT 1 FROM store_follows f WHERE f.store_id = s.id AND f.visitor_id = $1)`
const PER_GROUP = 6

export interface ReturnSpark { id: string; excerpt: string; store_handle: string; store_name: string; published_at: string }
export interface ReturnThing { id: string; title: string; price_minor: number | null; currency: string | null; store_handle: string; store_name: string; image_url: string | null; published_at: string }
export interface ReturnDeal { id: string; headline: string; store_handle: string; store_name: string; published_at: string }

export interface ReturnJourney {
  /** null when there is no prior visit to measure against (cold start / first visit). */
  since: string | null
  /** true only when at least one group has real content. */
  has_changes: boolean
  voices: ReturnSpark[]      // sparks from followed makers — the voice leads
  things: ReturnThing[]      // new products from followed shops (photo required, same as the feed)
  deals: ReturnDeal[]        // deals that started at followed shops
  counts: { voices: number; things: number; deals: number; makers: number }
}

const EMPTY: Omit<ReturnJourney, 'since'> = {
  has_changes: false, voices: [], things: [], deals: [], counts: { voices: 0, things: 0, deals: 0, makers: 0 },
}

export async function returnJourney(tx: Tx, visitorId: string | null, lastVisit: string | null): Promise<ReturnJourney> {
  if (!visitorId || !lastVisit) return { since: lastVisit, ...EMPTY }
  const client = asClient(tx)

  const [voices, things, deals] = await Promise.all([
    client.query<ReturnSpark>(
      `SELECT sp.id, left(sp.body, 160) AS excerpt, s.handle AS store_handle, s.name AS store_name,
              sp.published_at::text AS published_at
       FROM sparks sp JOIN stores s ON s.id = sp.channel_id AND ${LIVE}
       WHERE sp.status = 'published' AND sp.published_at > $2::timestamptz AND ${FOLLOWS}
       ORDER BY sp.published_at DESC LIMIT ${PER_GROUP}`, [visitorId, lastVisit]),
    client.query<ReturnThing>(
      `SELECT p.id, p.title,
              (SELECT min(${effectivePriceSql('v')})::int FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS price_minor,
              (SELECT min(v.price_currency) FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS currency,
              s.handle AS store_handle, s.name AS store_name, img.url AS image_url, l.published_at::text AS published_at
       FROM listings l
       JOIN products p ON p.id = l.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
       JOIN stores s ON s.id = l.channel_id AND ${LIVE}
       LEFT JOIN LATERAL (
         SELECT ma.url FROM product_media pm JOIN media_assets ma ON ma.id = pm.media_id
         WHERE pm.product_id = p.id ORDER BY (pm.role = 'hero') DESC, pm.position ASC LIMIT 1
       ) img ON true
       WHERE l.status = 'published' AND l.published_at > $2::timestamptz AND ${FOLLOWS}
         AND EXISTS (SELECT 1 FROM product_media pm WHERE pm.product_id = p.id)
       ORDER BY l.published_at DESC LIMIT ${PER_GROUP}`, [visitorId, lastVisit]),
    client.query<ReturnDeal>(
      `SELECT d.id, d.headline, s.handle AS store_handle, s.name AS store_name, d.published_at::text AS published_at
       FROM deals d
       JOIN listings l ON l.product_id = d.product_id AND l.channel_id = d.channel_id AND l.status = 'published'
       JOIN products p ON p.id = d.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
       JOIN stores s ON s.id = d.channel_id AND ${LIVE}
       WHERE d.status = 'published' AND d.ended_at IS NULL AND d.published_at > $2::timestamptz AND ${FOLLOWS}
       ORDER BY d.published_at DESC LIMIT ${PER_GROUP}`, [visitorId, lastVisit]),
  ])

  const makers = new Set([
    ...voices.rows.map((v) => v.store_handle),
    ...things.rows.map((t) => t.store_handle),
    ...deals.rows.map((d) => d.store_handle),
  ]).size
  const has = voices.rows.length + things.rows.length + deals.rows.length > 0

  return {
    since: lastVisit, has_changes: has,
    voices: voices.rows, things: things.rows, deals: deals.rows,
    counts: { voices: voices.rows.length, things: things.rows.length, deals: deals.rows.length, makers },
  }
}
