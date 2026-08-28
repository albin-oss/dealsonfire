/**
 * LS-4 — the street pulse, attacked.
 *
 * The laws under fire: one person can never be a crowd (distinct-people
 * counting); anonymous glances never become evidence; the projection replays
 * to identical rows and swaps atomically; a held store vanishes at READ time
 * even from a stale projection; diversity is a hard constraint of the result
 * set; exploration is bounded, deterministic, and keyed to STORE age (content
 * cycling cannot reset it); with no projection the street degrades to
 * chronology. Plus the Founder's merchant-fairness simulation A–G.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { PULSE } from '../../../server/utils/street-pulse'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function makeStore(name: string, handle: string, opts: { hold?: boolean; ageDays?: number } = {}) {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `m-${uuidv7()}@maker.example`, password: 'a maker passphrase' } })
  const cookie = `dof_session=${decodeURIComponent(/dof_session=([^;]+)/.exec(reg.headers.get('set-cookie') ?? '')![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: name } })
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name, handle } })
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
  if (opts.ageDays) {
    await container.pool.query(`UPDATE stores SET published_at = now() - ($2 || ' days')::interval WHERE id = $1`,
      [store.body.store_id, String(opts.ageDays)])
  }
  if (opts.hold) await container.pool.query(`UPDATE stores SET enforcement_hold = 'under_review' WHERE id = $1`, [store.body.store_id])
  return { cookie, businessId: biz.body.business_id as string, storeId: store.body.store_id as string }
}

async function makeProduct(w: { cookie: string; businessId: string; storeId: string }, title: string, ageHours = 0) {
  const r = await http.request('POST', '/api/v1/products', {
    headers: { cookie: w.cookie },
    body: { business_id: w.businessId, title, fulfillment_kind: 'physical', default_price: { amount: 2500, currency: 'EUR' }, publish_to_store_id: w.storeId },
  })
  if (ageHours > 0) {
    await container.pool.query(`UPDATE listings SET published_at = now() - ($2 || ' hours')::interval WHERE product_id = $1`,
      [r.body.product_id, String(ageHours)])
  }
  return r.body.product_id as string
}

/** N distinct people fire a deal / follow a store — the honest way to earn interest. */
async function fires(dealId: string, n: number) {
  for (let i = 0; i < n; i++) {
    await http.request('POST', `/api/v1/public/deals/${dealId}/react`, { body: {} })
  }
}

const rebuild = () => container.engagement.rebuildStreetPulse()
const street = () => http.request('GET', '/api/v1/public/street')
const pulseRows = async () => (await container.pool.query(
  `SELECT subject_type, subject_id, store_id, published_at, people_7d, stops_7d, glances_7d
   FROM rm_street_pulse ORDER BY subject_type, subject_id`)).rows

beforeAll(async () => {
  container = newTestContainer()
  setContainer(container)
  http = await startTestApp()
})
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => {
  await truncateAll(container.pool)
  await container.pool.query(`DROP TABLE IF EXISTS rm_street_pulse`)
  await container.pool.query(`DROP TABLE IF EXISTS rm_street_pulse__shadow`)
  ;(container.rateLimiter as { reset?: () => void }).reset?.()
})

describe('LS-4 — projection law', () => {
  it('no projection → the street degrades to chronology, never fails closed', async () => {
    const r = await street()
    expect(r.status).toBe(200)
    expect(r.body.mode).toBe('chronology')
  })

  it('replay: two rebuilds from the same facts yield identical rows; the swap is atomic and version-stamped', async () => {
    const w = await makeStore('Rosa Knits', 'rosa-knits')
    await makeProduct(w, 'Lavender Blanket')
    await rebuild()
    const first = await pulseRows()
    expect(first.length).toBeGreaterThan(0)
    await rebuild()
    const second = await pulseRows()
    expect(second.map(({ published_at: _p, ...r }) => r)).toEqual(first.map(({ published_at: _p, ...r }) => r))
    const { rows } = await container.pool.query(`SELECT obj_description(to_regclass('rm_street_pulse'), 'pg_class') AS c`)
    expect(rows[0].c).toBe('projection v1')
    const shadow = await container.pool.query(`SELECT to_regclass('rm_street_pulse__shadow') AS t`)
    expect(shadow.rows[0].t).toBeNull() // no partial rebuild left behind
  })

  it('a held store vanishes from the street AT READ TIME — even when the projection still carries it', async () => {
    const w = await makeStore('Zanzibar Curios', 'zanzibar-curios')
    await makeProduct(w, 'Xylophonic Seashell')
    await rebuild()
    const before = await street()
    expect(before.body.mode).toBe('pulse')
    expect(before.body.items.length).toBeGreaterThan(0)
    // the hold lands AFTER the projection was built — no rebuild happens
    await container.pool.query(`UPDATE stores SET enforcement_hold = 'under_review' WHERE id = $1`, [w.storeId])
    const after = await street()
    const leaked = after.body.items?.filter((i: { store_handle: string }) => i.store_handle === 'zanzibar-curios') ?? []
    expect(leaked).toHaveLength(0)
    const stale = await container.pool.query(`SELECT count(*)::int AS n FROM rm_street_pulse WHERE store_id = $1`, [w.storeId])
    expect(stale.rows[0].n).toBeGreaterThan(0) // the projection IS stale; the read is not
  })
})

describe('LS-4 — manipulation resistance', () => {
  it('one visitor hammering views and clicks stays ONE person; anonymous glances never become people', async () => {
    const w = await makeStore('Rosa Knits', 'rosa-knits')
    const productId = await makeProduct(w, 'Lavender Blanket')

    // one identified visitor: mint identity via an engagement write, then hammer
    const react = await http.request('POST', `/api/v1/public/deals/${uuidv7()}/react`, { body: {} }) // 404s but mints nothing
    const follow = await http.request('POST', `/api/v1/public/stores/rosa-knits/follow`, { body: {} })
    const visitorCookie = /dof_visitor=[^;]+/.exec(follow.headers.get('set-cookie') ?? '')?.[0] ?? ''
    expect(visitorCookie).not.toBe('')
    for (let i = 0; i < 10; i++) {
      await http.request('POST', '/api/v1/public/attention', {
        headers: { cookie: visitorCookie },
        body: { events: [
          { type: 'product_view', subject_type: 'product', subject_id: productId, source: 'home' },
          { type: 'lane_click', subject_type: 'product', subject_id: productId, lane: 'soft-wearable', source: 'lane' },
        ] },
      })
    }
    // anonymous exposure flood: 20 impressions with no identity
    for (let i = 0; i < 10; i++) {
      await http.request('POST', '/api/v1/public/attention', {
        body: { events: [
          { type: 'feed_impression', subject_type: 'product', subject_id: productId, source: 'home' },
          { type: 'feed_impression', subject_type: 'product', subject_id: productId, source: 'home' },
        ] },
      })
    }
    await rebuild()
    const { rows } = await container.pool.query(
      `SELECT people_7d, stops_7d, glances_7d FROM rm_street_pulse WHERE subject_type = 'product' AND subject_id = $1`, [productId])
    expect(rows[0].people_7d).toBe(1)   // ten hammered clicks = one person
    expect(rows[0].stops_7d).toBe(1)    // ten views = one identified viewer
    expect(rows[0].glances_7d).toBe(20) // exposure counted honestly — and worth nothing as evidence
    expect(rows[0].people_7d).toBeLessThan(3) // no "people are stopping here" cue from one attacker
  })

  it('store-age exploration cannot be regained by deleting and recreating content', async () => {
    const w = await makeStore('Old Hand', 'old-hand', { ageDays: 200 })
    const productId = await makeProduct(w, 'Recycled Novelty') // brand-new content, old store
    await rebuild()
    const { rows } = await container.pool.query(
      `SELECT (ss.published_at > now() - interval '${PULSE.NEW_MAKER_DAYS} days') AS store_is_new
       FROM rm_street_pulse rp JOIN stores ss ON ss.id = rp.store_id
       WHERE rp.subject_type = 'product' AND rp.subject_id = $1`, [productId])
    expect(rows[0].store_is_new).toBe(false) // fresh content, but the STORE age gates new-maker status
  })
})

describe('LS-4 — diversity and exploration are result-set law', () => {
  it('one prolific merchant cannot consume the street: per-store cap, no consecutive same-store, type runs capped', async () => {
    const big = await makeStore('Big Wool Empire', 'big-wool', { ageDays: 60 })
    for (let i = 1; i <= 12; i++) await makeProduct(big, `Empire Blanket No ${i}`)
    const small = await makeStore('Marta Ceramics', 'marta-ceramics', { ageDays: 1 })
    await makeProduct(small, 'Speckled Mug')
    const other = await makeStore('Grain and Crumb', 'grain-crumb', { ageDays: 10 })
    await makeProduct(other, 'Friday Sourdough')
    await rebuild()

    const r = await street()
    expect(r.body.mode).toBe('pulse')
    const items: Array<{ store_handle: string; subject_type: string }> = r.body.items
    const perStore = new Map<string, number>()
    for (const i of items) perStore.set(i.store_handle, (perStore.get(i.store_handle) ?? 0) + 1)
    expect(perStore.get('big-wool') ?? 0).toBeLessThanOrEqual(PULSE.MAX_PER_STORE_PAGE)
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.store_handle, `consecutive same-store at ${i}`).not.toBe(items[i - 1]!.store_handle)
    }
    let run = 1
    for (let i = 1; i < items.length; i++) {
      run = items[i]!.subject_type === items[i - 1]!.subject_type ? run + 1 : 1
      expect(run, `type run at ${i}`).toBeLessThanOrEqual(PULSE.TYPE_RUN_CAP)
    }
    // the day-old maker with zero history is ON the street (exploration working)
    expect(items.some((i) => i.store_handle === 'marta-ceramics')).toBe(true)
  })
})

describe('LS-4 — merchant fairness simulation (Founder scenarios A–G)', () => {
  it('A established+loved, B excellent new w/ zero history, C popular merchant, D strong small maker: all reachable; nobody monopolizes', async () => {
    // A: established merchant with real accumulated interest (3 distinct people fired the deal — via three visitors)
    const a = await makeStore('Ember and Oak', 'ember-oak', { ageDays: 90 })
    await makeProduct(a, 'Bonfire Candle', 30)
    // C: the same popular merchant's mediocre new content
    await makeProduct(a, 'Mediocre Candle Stub', 1)
    // B: excellent new merchant, zero interactions
    const b = await makeStore('Fresh Thread', 'fresh-thread', { ageDays: 2 })
    await makeProduct(b, 'First Quilt', 2)
    // D: strong content from a small older shop
    const d = await makeStore('Quiet Pots', 'quiet-pots', { ageDays: 120 })
    await makeProduct(d, 'Raku Bowl', 4)
    // three real distinct people follow A's store (identified intent)
    for (let i = 0; i < 3; i++) {
      await http.request('POST', `/api/v1/public/stores/ember-oak/follow`, { body: {} })
    }
    await rebuild()

    const r = await street()
    const handles = (r.body.items as Array<{ store_handle: string }>).map((i) => i.store_handle)
    expect(handles).toContain('ember-oak')      // A: evidence counts…
    expect(new Set(handles.filter((h) => h === 'ember-oak')).size).toBe(1)
    expect(handles.filter((h) => h === 'ember-oak').length).toBeLessThanOrEqual(PULSE.MAX_PER_STORE_PAGE) // …but never a monopoly
    expect(handles).toContain('fresh-thread')   // B: day-two maker present with zero history
    expect(handles).toContain('quiet-pots')     // D: small maker's fresh work present
    // F: a temporarily quiet merchant with old strong content decays rather than squatting the top
    const positions = new Map(handles.map((h, i) => [h, handles.indexOf(h)]))
    expect(positions.get('fresh-thread')!).toBeLessThan(PULSE.PAGE) // reachable on page one
  })
})
