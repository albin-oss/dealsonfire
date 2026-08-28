/**
 * Lane contents (LS-3) — deterministic, explainable, never ranked.
 *
 * Search lanes delegate to the LS-2 engine (same visibility law, same index
 * work); rule lanes are plain predicates. Ordering everywhere: newest first —
 * chronology is the law inside shared geography. The LIVE conjunction is
 * repeated per branch exactly as everywhere else: a held store leaves every
 * lane instantly.
 */
import type { Tx } from '@platform/types'
import { asClient } from '@platform/db'
import { LANES, laneById, type Lane } from '@contracts/discovery/lanes'
import { searchStreet, type StreetSearchResults } from './street-search'

const LIVE = `s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL`
const RULE_LIMIT = 24
/** 'new on the street' = opened within 30 days; 'fresh today' = 24h rolling. */
export const NEW_SHOP_DAYS = 30
export const FRESH_HOURS = 24
export const UNDER_25_MINOR = 2500

export interface LaneSummary {
  id: string; title: string; blurb: string; kind: Lane['kind']
  count: number; preview: string[]
}
export interface LaneContents extends StreetSearchResults {
  lane: { id: string; title: string; blurb: string; inclusion: string; kind: Lane['kind']; q: string | null }
}

const emptyGroups = (): StreetSearchResults => ({
  shops: [], products: [], deals: [], sparks: [],
  totals: { shops: 0, products: 0, deals: 0, sparks: 0 }, fuzzy: false,
})

async function ruleContents(tx: Tx, rule: NonNullable<Lane['rule']>): Promise<StreetSearchResults> {
  const client = asClient(tx)
  const out = emptyGroups()

  const productSelect = `
    SELECT p.id, p.title,
           (SELECT min(v.price_amount)::int FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS price_minor,
           (SELECT min(v.price_currency) FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS currency,
           s.handle AS store_handle, s.name AS store_name, img.url AS image_url, NULL AS excerpt,
           count(*) OVER ()::int AS total
    FROM listings l
    JOIN products p ON p.id = l.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
    JOIN stores s ON s.id = l.channel_id AND ${LIVE}
    LEFT JOIN LATERAL (
      SELECT ma.url FROM product_media pm JOIN media_assets ma ON ma.id = pm.media_id
      WHERE pm.product_id = p.id ORDER BY (pm.role = 'hero') DESC, pm.position ASC LIMIT 1
    ) img ON true
    WHERE l.status = 'published'`

  if (rule === 'services' || rule === 'under_25' || rule === 'fresh_today') {
    const predicate =
      rule === 'services' ? `AND p.fulfillment_kind = 'service'`
      : rule === 'under_25' ? `AND (SELECT min(v.price_amount) FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) < ${UNDER_25_MINOR}`
      : `AND l.published_at > now() - interval '${FRESH_HOURS} hours'`
    const { rows } = await client.query(
      `${productSelect} ${predicate} ORDER BY l.published_at DESC, p.id DESC LIMIT ${RULE_LIMIT}`)
    out.products = rows.map(({ total: _t, ...r }) => r) as typeof out.products
    out.totals.products = Number(rows[0]?.total ?? 0)
  }

  if (rule === 'deals_now' || rule === 'fresh_today') {
    const extra = rule === 'fresh_today' ? `AND d.published_at > now() - interval '${FRESH_HOURS} hours'` : ''
    const { rows } = await client.query(
      `SELECT d.id, d.headline, s.handle AS store_handle, s.name AS store_name, NULL AS excerpt,
              count(*) OVER ()::int AS total
       FROM deals d
       JOIN listings l ON l.product_id = d.product_id AND l.channel_id = d.channel_id AND l.status = 'published'
       JOIN products p ON p.id = d.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
       JOIN stores s ON s.id = d.channel_id AND ${LIVE}
       WHERE d.status = 'published' AND d.ended_at IS NULL ${extra}
       ORDER BY d.published_at DESC, d.id DESC LIMIT ${RULE_LIMIT}`)
    out.deals = rows.map(({ total: _t, ...r }) => r) as typeof out.deals
    out.totals.deals = Number(rows[0]?.total ?? 0)
  }

  if (rule === 'new_shops') {
    const { rows } = await client.query(
      `SELECT s.id, s.handle, s.name, b.voice->>'tone' AS tagline,
              CASE WHEN coalesce(b.voice->>'story', '') <> '' THEN left(b.voice->>'story', 120) END AS excerpt,
              count(*) OVER ()::int AS total
       FROM stores s LEFT JOIN brand_kits b ON b.owner_type = 'store' AND b.owner_id = s.id
       WHERE ${LIVE} AND s.published_at > now() - interval '${NEW_SHOP_DAYS} days'
       ORDER BY s.published_at DESC, s.id DESC LIMIT ${RULE_LIMIT}`)
    out.shops = rows.map(({ total: _t, ...r }) => r) as typeof out.shops
    out.totals.shops = Number(rows[0]?.total ?? 0)
  }

  if (rule === 'fresh_today') {
    const { rows } = await client.query(
      `SELECT sp.id, left(sp.body, 120) AS excerpt, s.handle AS store_handle, s.name AS store_name,
              count(*) OVER ()::int AS total
       FROM sparks sp JOIN stores s ON s.id = sp.channel_id AND ${LIVE}
       WHERE sp.status = 'published' AND sp.published_at > now() - interval '${FRESH_HOURS} hours'
       ORDER BY sp.published_at DESC, sp.id DESC LIMIT ${RULE_LIMIT}`)
    out.sparks = rows.map(({ total: _t, ...r }) => r) as typeof out.sparks
    out.totals.sparks = Number(rows[0]?.total ?? 0)
  }

  return out
}

export async function laneContents(tx: Tx, id: string): Promise<LaneContents | null> {
  const lane = laneById(id)
  if (!lane) return null
  const groups = lane.kind === 'search'
    ? await searchStreet(tx, lane.q!, { scope: 'all' })
    : await ruleContents(tx, lane.rule!)
  // a lane never claims the fuzzy voice — it is geography, not a guess
  return { lane: { id: lane.id, title: lane.title, blurb: lane.blurb, inclusion: lane.inclusion, kind: lane.kind, q: lane.q ?? null }, ...groups, fuzzy: false }
}

export async function laneSummaries(tx: Tx): Promise<LaneSummary[]> {
  const out: LaneSummary[] = []
  for (const lane of LANES) {
    const c = await laneContents(tx, lane.id)
    if (!c) continue
    const count = c.totals.shops + c.totals.products + c.totals.deals + c.totals.sparks
    const preview = [
      ...c.shops.map((s) => s.name), ...c.products.map((p) => p.title),
      ...c.deals.map((d) => d.headline), ...c.sparks.map((sp) => sp.store_name),
    ].slice(0, 3)
    out.push({ id: lane.id, title: lane.title, blurb: lane.blurb, kind: lane.kind, count, preview })
  }
  return out
}
