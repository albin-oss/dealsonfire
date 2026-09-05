/**
 * Street search (LS-2) — ask the street, not a database.
 *
 * Relevance law (explainable, no popularity): what a thing is CALLED (weight A)
 * beats what is SAID about it (B) beats the story around it (C); ties break by
 * freshness. Follower counts, fires, sales — never inputs. websearch_to_tsquery
 * handles natural phrasing/word order; the 'english' config handles stems
 * (blanket/blankets). When words find nothing, trigram similarity rescues
 * ordinary typos ("lavendar") on names/titles only — marked `fuzzy` so the UI
 * can say so honestly.
 *
 * Visibility is absolute and repeated per branch (live + no hold + not deleted;
 * published listings/deals/sparks). A held store's name, story, products, deals,
 * and sparks are all unreachable through EVERY path including fuzzy — search
 * must never become a visibility oracle.
 *
 * Excerpts come from ts_headline with ⟪⟫ markers; the UI splits on the markers
 * and renders <mark> segments itself (never v-html).
 */
import type { Tx } from '@platform/types'
import { asClient } from '@platform/db'

import { effectivePriceSql } from '@domains/commerce/pricing/effective-price'
export type SearchScope = 'all' | 'shops' | 'products' | 'deals' | 'sparks'

export interface ShopHit {
  id: string; handle: string; name: string; tagline: string | null; excerpt: string | null
}
export interface ProductHit {
  id: string; title: string; price_minor: number | null; currency: string | null
  store_handle: string; store_name: string; image_url: string | null; excerpt: string | null
}
export interface DealHit { id: string; headline: string; store_handle: string; store_name: string; excerpt: string | null }
export interface SparkHit { id: string; excerpt: string; store_handle: string; store_name: string }

export interface StreetSearchResults {
  shops: ShopHit[]; products: ProductHit[]; deals: DealHit[]; sparks: SparkHit[]
  totals: { shops: number; products: number; deals: number; sparks: number }
  fuzzy: boolean
}

const LIVE = `s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL`
const HEADLINE = `StartSel=⟪, StopSel=⟫, MaxWords=18, MinWords=6, MaxFragments=1`

// verbatim twins of the 0032 index expressions — drift breaks the index, so
// keep these strings in lockstep with the migration
const V_STORE = `to_tsvector('english', s.name)`
const V_BRAND = `(setweight(to_tsvector('english', coalesce(b.voice->>'tone', '')), 'B') ||
                 setweight(to_tsvector('english', coalesce(b.voice->>'story', '')), 'C') ||
                 setweight(to_tsvector('english', coalesce(b.voice->>'promise', '')), 'C'))`
const V_PRODUCT = `(setweight(to_tsvector('english', p.title), 'A') ||
                   setweight(to_tsvector('english', coalesce(p.description->>'content', '')), 'B'))`
const V_DEAL = `(setweight(to_tsvector('english', d.headline), 'A') ||
                setweight(to_tsvector('english', coalesce(d.story, '')), 'B'))`
const V_SPARK = `to_tsvector('english', sp.body)`

export const SEARCH_PAGE_SIZE = 24
const GROUP_PREVIEW = 5
const MAX_PAGE = 8 // offset paging honestly bounded; revisit when a real street outgrows it

export async function searchStreet(
  tx: Tx, q: string, opts: { scope?: SearchScope; page?: number } = {},
): Promise<StreetSearchResults> {
  const client = asClient(tx)
  const scope = opts.scope ?? 'all'
  const page = Math.min(Math.max(opts.page ?? 1, 1), MAX_PAGE)
  const limit = scope === 'all' ? GROUP_PREVIEW : SEARCH_PAGE_SIZE
  const offset = scope === 'all' ? 0 : (page - 1) * SEARCH_PAGE_SIZE
  const want = (g: Exclude<SearchScope, 'all'>) => scope === 'all' || scope === g

  const empty = { shops: [], products: [], deals: [], sparks: [], totals: { shops: 0, products: 0, deals: 0, sparks: 0 }, fuzzy: false }

  // websearch_to_tsquery is injection-safe by design (it parses, never executes);
  // an all-stopword query yields an empty tsquery which matches nothing → fuzzy path
  const shopsQ = want('shops')
    ? client.query<ShopHit & { total: string }>(
      `WITH query AS (SELECT websearch_to_tsquery('english', $1) AS ts),
       hits AS (
         SELECT s.id, s.handle, s.name, b.voice->>'tone' AS tagline,
                coalesce(b.voice->>'story', '') AS story,
                ts_rank_cd(setweight(${V_STORE}, 'A') || coalesce(${V_BRAND}, ''::tsvector), query.ts) AS rank,
                s.published_at
         FROM stores s
         LEFT JOIN brand_kits b ON b.owner_type = 'store' AND b.owner_id = s.id
         CROSS JOIN query
         WHERE ${LIVE} AND (${V_STORE} @@ query.ts OR ${V_BRAND} @@ query.ts)
       )
       SELECT id, handle, name, tagline,
              CASE WHEN story <> '' THEN ts_headline('english', story, (SELECT ts FROM query), '${HEADLINE}') END AS excerpt,
              count(*) OVER ()::text AS total
       FROM hits, query
       ORDER BY rank DESC, published_at DESC NULLS LAST, id DESC
       LIMIT ${limit} OFFSET ${offset}`, [q])
    : null

  const productsQ = want('products')
    ? client.query<ProductHit & { total: string }>(
      `WITH query AS (SELECT websearch_to_tsquery('english', $1) AS ts),
       hits AS (
         SELECT p.id, p.title, coalesce(p.description->>'content', '') AS content,
                s.handle AS store_handle, s.name AS store_name,
                (SELECT min(${effectivePriceSql('v')})::int FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS price_minor,
                (SELECT min(v.price_currency) FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS currency,
                img.url AS image_url,
                ts_rank_cd(${V_PRODUCT}, query.ts) AS rank, l.published_at
         FROM listings l
         JOIN products p ON p.id = l.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
         JOIN stores s ON s.id = l.channel_id AND ${LIVE}
         LEFT JOIN LATERAL (
           SELECT ma.url FROM product_media pm JOIN media_assets ma ON ma.id = pm.media_id
           WHERE pm.product_id = p.id ORDER BY (pm.role = 'hero') DESC, pm.position ASC LIMIT 1
         ) img ON true
         CROSS JOIN query
         WHERE l.status = 'published' AND ${V_PRODUCT} @@ query.ts
       )
       SELECT id, title, price_minor, currency, store_handle, store_name, image_url,
              CASE WHEN content <> '' THEN ts_headline('english', content, (SELECT ts FROM query), '${HEADLINE}') END AS excerpt,
              count(*) OVER ()::text AS total
       FROM hits, query
       ORDER BY rank DESC, published_at DESC, id DESC
       LIMIT ${limit} OFFSET ${offset}`, [q])
    : null

  const dealsQ = want('deals')
    ? client.query<DealHit & { total: string }>(
      `WITH query AS (SELECT websearch_to_tsquery('english', $1) AS ts),
       hits AS (
         SELECT d.id, d.headline, coalesce(d.story, '') AS story,
                s.handle AS store_handle, s.name AS store_name,
                ts_rank_cd(${V_DEAL}, query.ts) AS rank, d.published_at
         FROM deals d
         JOIN listings l ON l.product_id = d.product_id AND l.channel_id = d.channel_id AND l.status = 'published'
         JOIN products p ON p.id = d.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
         JOIN stores s ON s.id = d.channel_id AND ${LIVE}
         CROSS JOIN query
         WHERE d.status = 'published' AND ${V_DEAL} @@ query.ts
       )
       SELECT id, headline, store_handle, store_name,
              CASE WHEN story <> '' THEN ts_headline('english', story, (SELECT ts FROM query), '${HEADLINE}') END AS excerpt,
              count(*) OVER ()::text AS total
       FROM hits, query
       ORDER BY rank DESC, published_at DESC, id DESC
       LIMIT ${limit} OFFSET ${offset}`, [q])
    : null

  const sparksQ = want('sparks')
    ? client.query<SparkHit & { total: string }>(
      `WITH query AS (SELECT websearch_to_tsquery('english', $1) AS ts),
       hits AS (
         SELECT sp.id, sp.body, s.handle AS store_handle, s.name AS store_name,
                ts_rank_cd(${V_SPARK}, query.ts) AS rank, sp.published_at
         FROM sparks sp
         JOIN stores s ON s.id = sp.channel_id AND ${LIVE}
         CROSS JOIN query
         WHERE sp.status = 'published' AND ${V_SPARK} @@ query.ts
       )
       SELECT id, ts_headline('english', body, (SELECT ts FROM query), '${HEADLINE}') AS excerpt,
              store_handle, store_name, count(*) OVER ()::text AS total
       FROM hits, query
       ORDER BY rank DESC, published_at DESC, id DESC
       LIMIT ${limit} OFFSET ${offset}`, [q])
    : null

  const [shops, products, deals, sparks] = await Promise.all([shopsQ, productsQ, dealsQ, sparksQ])
  const total = (r: { rows: Array<{ total: string }> } | null) => Number(r?.rows[0]?.total ?? 0)
  const strip = <T extends { total?: string }>(r: { rows: T[] } | null): Omit<T, 'total'>[] =>
    (r?.rows ?? []).map(({ total: _total, ...rest }) => rest)

  const results: StreetSearchResults = {
    shops: strip(shops) as ShopHit[], products: strip(products) as ProductHit[],
    deals: strip(deals) as DealHit[], sparks: strip(sparks) as SparkHit[],
    totals: { shops: total(shops), products: total(products), deals: total(deals), sparks: total(sparks) },
    fuzzy: false,
  }
  const found = results.totals.shops + results.totals.products + results.totals.deals + results.totals.sparks
  if (found > 0 || page > 1) return found === 0 ? { ...empty } : results

  // ——— typo rescue: word-similarity on names/titles only, same visibility law
  const [fShops, fProducts] = await Promise.all([
    want('shops')
      ? client.query<ShopHit>(
        `SELECT s.id, s.handle, s.name, b.voice->>'tone' AS tagline, NULL AS excerpt
         FROM stores s LEFT JOIN brand_kits b ON b.owner_type = 'store' AND b.owner_id = s.id
         WHERE ${LIVE} AND lower($1) <% lower(s.name)
         ORDER BY word_similarity(lower($1), lower(s.name)) DESC, s.published_at DESC NULLS LAST
         LIMIT ${limit}`, [q])
      : null,
    want('products')
      ? client.query<ProductHit>(
        `SELECT p.id, p.title,
                (SELECT min(${effectivePriceSql('v')})::int FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS price_minor,
                (SELECT min(v.price_currency) FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS currency,
                s.handle AS store_handle, s.name AS store_name, img.url AS image_url, NULL AS excerpt
         FROM listings l
         JOIN products p ON p.id = l.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
         JOIN stores s ON s.id = l.channel_id AND ${LIVE}
         LEFT JOIN LATERAL (
           SELECT ma.url FROM product_media pm JOIN media_assets ma ON ma.id = pm.media_id
           WHERE pm.product_id = p.id ORDER BY (pm.role = 'hero') DESC, pm.position ASC LIMIT 1
         ) img ON true
         WHERE l.status = 'published' AND lower($1) <% lower(p.title)
         ORDER BY word_similarity(lower($1), lower(p.title)) DESC, l.published_at DESC
         LIMIT ${limit}`, [q])
      : null,
  ])
  const fs = fShops?.rows ?? []
  const fp = fProducts?.rows ?? []
  if (fs.length + fp.length === 0) return { ...empty }
  return {
    shops: fs, products: fp, deals: [], sparks: [],
    totals: { shops: fs.length, products: fp.length, deals: 0, sparks: 0 },
    fuzzy: true,
  }
}
