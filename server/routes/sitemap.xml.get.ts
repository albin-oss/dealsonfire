/**
 * /sitemap.xml (LS-8) — the street, enumerated for the open web.
 *
 * Index-worthiness law: only public entities the visibility law already
 * approves — live unheld stores, their published products and live deals,
 * published sparks (durable standalone pages), non-empty lanes, and the two
 * public doors (/home, /shops). Everything else is deliberately absent:
 * held/draft/deleted entities (the EXISTING visibility conjunction, never a
 * parallel SEO copy), account/token/recovery surfaces, /search and its query
 * permutations, legal placeholders (bannered NOT APPROVED — not index-worthy
 * until counsel text lands), and empty lanes (thinness law: a page is
 * indexable only when useful to a human).
 *
 * SCALE LAW: one flat sitemap is correct below ~10,000 URLs. Past that,
 * convert to a sitemap index with per-entity child sitemaps (stores /
 * products / deals / sparks) partitioned by month — the queries here already
 * split naturally. Do not build that machinery before the street needs it.
 *
 * lastmod is real (entity update/publish times); changefreq/priority are
 * omitted — search engines ignore invented values, and we don't invent.
 */
import { defineEventHandler, getRequestURL, setResponseHeader } from 'h3'
import { getContainer } from '../utils/container'
import { LANES } from '@contracts/discovery/lanes'

const LIVE = `s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL`

const esc = (u: string) => u.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;')

export default defineEventHandler(async (event) => {
  const c = getContainer()
  const origin = getRequestURL(event).origin

  const [stores, products, deals, sparks, laneRows] = await Promise.all([
    c.pool.query<{ handle: string; lastmod: string }>(
      `SELECT s.handle, greatest(s.published_at, s.updated_at)::timestamptz AS lastmod
       FROM stores s WHERE ${LIVE} ORDER BY s.published_at DESC`),
    c.pool.query<{ handle: string; id: string; lastmod: string }>(
      `SELECT s.handle, p.id, greatest(l.published_at, p.updated_at)::timestamptz AS lastmod
       FROM listings l
       JOIN products p ON p.id = l.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
       JOIN stores s ON s.id = l.channel_id AND ${LIVE}
       WHERE l.status = 'published' ORDER BY l.published_at DESC`),
    c.pool.query<{ handle: string; id: string; lastmod: string }>(
      `SELECT s.handle, d.id, greatest(d.published_at, d.updated_at)::timestamptz AS lastmod
       FROM deals d
       JOIN listings l ON l.product_id = d.product_id AND l.channel_id = d.channel_id AND l.status = 'published'
       JOIN products p ON p.id = d.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
       JOIN stores s ON s.id = d.channel_id AND ${LIVE}
       WHERE d.status = 'published' AND d.ended_at IS NULL ORDER BY d.published_at DESC`),
    c.pool.query<{ handle: string; id: string; lastmod: string }>(
      `SELECT s.handle, sp.id, sp.published_at::timestamptz AS lastmod
       FROM sparks sp JOIN stores s ON s.id = sp.channel_id AND ${LIVE}
       WHERE sp.status = 'published' ORDER BY sp.published_at DESC`),
    // a lane earns its sitemap line only when it holds something (thinness law)
    Promise.all(LANES.map(async (lane) => {
      const contents = await c.engagement.laneContents(lane.id)
      const total = contents
        ? contents.totals.shops + contents.totals.products + contents.totals.deals + contents.totals.sparks
        : 0
      return { id: lane.id, total }
    })),
  ])

  const now = new Date().toISOString()
  const urls: Array<{ loc: string; lastmod: string }> = [
    { loc: `${origin}/home`, lastmod: now },
    { loc: `${origin}/shops`, lastmod: now },
    ...stores.rows.map((r) => ({ loc: `${origin}/s/${r.handle}`, lastmod: new Date(r.lastmod).toISOString() })),
    ...products.rows.map((r) => ({ loc: `${origin}/s/${r.handle}/p/${r.id}`, lastmod: new Date(r.lastmod).toISOString() })),
    ...deals.rows.map((r) => ({ loc: `${origin}/s/${r.handle}/d/${r.id}`, lastmod: new Date(r.lastmod).toISOString() })),
    ...sparks.rows.map((r) => ({ loc: `${origin}/s/${r.handle}/sparks/${r.id}`, lastmod: new Date(r.lastmod).toISOString() })),
    ...laneRows.filter((l) => l.total > 0).map((l) => ({ loc: `${origin}/street/${l.id}`, lastmod: now })),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}
</urlset>
`
  setResponseHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  // short shared cache: an enforcement hold falls out within five minutes
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300, s-maxage=300')
  return xml
})
