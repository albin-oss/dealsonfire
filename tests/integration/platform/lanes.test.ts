/**
 * LS-3 — lanes, attacked.
 *
 * The laws: a lane is DETERMINISTIC shared geography (inclusion rules that a
 * buyer could re-derive; newest-first inside; never ranked, never
 * personalized); a held store leaves EVERY lane instantly; empty lanes tell
 * the truth instead of erroring; lane telemetry follows the LS-1 privacy law
 * (a fabricated lane id is not a fact).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { LANES } from '@contracts/discovery/lanes'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function makeStore(opts: { name: string; handle: string; tagline?: string; hold?: boolean }) {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `m-${uuidv7()}@maker.example`, password: 'a maker passphrase' } })
  const cookie = `dof_session=${decodeURIComponent(/dof_session=([^;]+)/.exec(reg.headers.get('set-cookie') ?? '')![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: opts.name } })
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: opts.name, handle: opts.handle } })
  if (opts.tagline) {
    await container.pool.query(`UPDATE brand_kits SET voice = voice || $2::jsonb WHERE owner_type = 'store' AND owner_id = $1`,
      [store.body.store_id, JSON.stringify({ tone: opts.tagline })])
  }
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
  if (opts.hold) await container.pool.query(`UPDATE stores SET enforcement_hold = 'under_review' WHERE id = $1`, [store.body.store_id])
  return { cookie, businessId: biz.body.business_id as string, storeId: store.body.store_id as string }
}

async function makeProduct(w: { cookie: string; businessId: string; storeId: string },
  title: string, opts: { amount?: number; kind?: string; description?: string } = {}) {
  const r = await http.request('POST', '/api/v1/products', {
    headers: { cookie: w.cookie },
    body: {
      business_id: w.businessId, title, fulfillment_kind: opts.kind ?? 'physical',
      ...(opts.description ? { description: { format: 'plain', content: opts.description } } : {}),
      default_price: { amount: opts.amount ?? 2500, currency: 'EUR' }, publish_to_store_id: w.storeId,
    },
  })
  return r.body.product_id as string
}

const lane = (id: string) => http.request('GET', `/api/v1/public/lanes/${id}`)
const everything = (b: Record<string, unknown[]>) => [...(b.shops as unknown[]), ...(b.products as unknown[]), ...(b.deals as unknown[]), ...(b.sparks as unknown[])]

beforeAll(async () => {
  container = newTestContainer()
  setContainer(container)
  http = await startTestApp()
})
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => {
  await truncateAll(container.pool)
  ;(container.rateLimiter as { reset?: () => void }).reset?.()
})

describe('LS-3 — deterministic shared geography', () => {
  it('every registered lane answers; unknown and malformed lanes are 404; empty lanes are honest 200s', async () => {
    for (const l of LANES) {
      const r = await lane(l.id)
      expect(r.status, l.id).toBe(200)
      expect(r.body.lane.inclusion.length).toBeGreaterThan(10) // the honest sentence ships
      expect(r.body.fuzzy).toBe(false) // geography never guesses
    }
    for (const bad of ['no-such-lane', 'UPPER', 'x', 'a'.repeat(41)]) {
      const r = await lane(bad)
      expect(r.status, bad).toBe(404)
    }
  })

  it('rule lanes include by their stated predicate — and nothing else', async () => {
    const w = await makeStore({ name: 'Second Wind', handle: 'second-wind' })
    await makeProduct(w, 'Coaching Session', { kind: 'service', amount: 6000 })
    await makeProduct(w, 'Cheap Zine', { amount: 900 })
    await makeProduct(w, 'Pricey Bench', { amount: 48000 })

    const services = await lane('help-hands')
    expect(services.body.products.map((p: { title: string }) => p.title)).toEqual(['Coaching Session'])
    const under = await lane('under-25')
    expect(under.body.products.map((p: { title: string }) => p.title)).toEqual(['Cheap Zine'])
    const fresh = await lane('fresh-today')
    expect(fresh.body.totals.products).toBe(3) // all three published just now
    await container.pool.query(`UPDATE listings SET published_at = now() - interval '25 hours'`)
    const later = await lane('fresh-today')
    expect(everything(later.body)).toHaveLength(0) // 24h rolling window, deterministic
    const newShops = await lane('new-shops')
    expect(newShops.body.shops.map((s: { name: string }) => s.name)).toEqual(['Second Wind'])
    await container.pool.query(`UPDATE stores SET published_at = now() - interval '31 days'`)
    const aged = await lane('new-shops')
    expect(aged.body.shops).toHaveLength(0) // 30 days of newness, then the lane moves on
  })

  it('search lanes are named street-searches: a shop joins by its own words, newest first, no ranking', async () => {
    const rosa = await makeStore({ name: 'Rosa Knits', handle: 'rosa-knits', tagline: 'soft wool things, knitted slowly' })
    await makeProduct(rosa, 'Lavender Blanket', { description: 'knitted merino wool throw' })
    const bakery = await makeStore({ name: 'Grain and Crumb', handle: 'grain-crumb', tagline: 'bread with a backbone' })
    await makeProduct(bakery, 'Friday Sourdough', { description: 'slow-fermented loaf' })

    const soft = await lane('soft-wearable')
    expect(soft.body.shops.map((s: { name: string }) => s.name)).toEqual(['Rosa Knits'])
    expect(soft.body.products.map((p: { title: string }) => p.title)).toContain('Lavender Blanket')
    expect(everything(soft.body).length).toBeGreaterThan(0)
    const food = await lane('food-drink')
    expect(food.body.shops.map((s: { name: string }) => s.name)).toEqual(['Grain and Crumb'])
    expect(food.body.products.map((p: { title: string }) => p.title)).toEqual(['Friday Sourdough'])
  })
})

describe('LS-3 — lanes are never a visibility oracle', () => {
  it('a held store leaves EVERY lane instantly: search lanes and each rule lane', async () => {
    const held = await makeStore({ name: 'Zanzibar Wool', handle: 'zanzibar-wool', tagline: 'soft knitted wool wonders', hold: true })
    await makeProduct(held, 'Knitted Wool Hat', { amount: 900 })
    await makeProduct(held, 'Wool Consultation', { kind: 'service', amount: 3000 })

    for (const id of ['soft-wearable', 'under-25', 'help-hands', 'fresh-today', 'new-shops']) {
      const r = await lane(id)
      expect(everything(r.body), `${id} leaked a held store`).toHaveLength(0)
    }
  })
})

describe('LS-3 — lane telemetry under the LS-1 privacy law', () => {
  it('lane views/clicks record with the lane slug; fabricated lanes and subjects are silently dropped; identity is never minted', async () => {
    const w = await makeStore({ name: 'Rosa Knits', handle: 'rosa-knits' })
    const productId = await makeProduct(w, 'Lavender Blanket')

    const r = await http.request('POST', '/api/v1/public/attention', {
      body: {
        events: [
          { type: 'lane_view', lane: 'soft-wearable', source: 'home' },
          { type: 'lane_click', subject_type: 'product', subject_id: productId, lane: 'soft-wearable', source: 'lane' },
          { type: 'lane_view', lane: 'invented-lane', source: 'home' },                                    // not a fact
          { type: 'lane_click', subject_type: 'product', subject_id: uuidv7(), lane: 'soft-wearable', source: 'lane' }, // fabricated subject
        ],
      },
    })
    expect(r.status).toBe(200)
    expect(r.body.accepted).toBe(2) // bare count; the attacker learns nothing more
    expect(r.headers.get('set-cookie')).toBeNull() // passive attention never mints identity

    const { rows } = await container.pool.query(
      `SELECT event_type, query, subject_id, visitor_id FROM attention_facts WHERE event_type IN ('lane_view','lane_click') ORDER BY event_type`)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ event_type: 'lane_click', query: 'soft-wearable', subject_id: productId, visitor_id: null })
    expect(rows[1]).toMatchObject({ event_type: 'lane_view', query: 'soft-wearable', subject_id: null, visitor_id: null })
  })
})
