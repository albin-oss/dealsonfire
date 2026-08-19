/**
 * LS-1 — the attention layer, attacked.
 *
 * Laws under test: the beacon NEVER mints identity · anonymous rows are
 * glances, never people · fabricated subjects are silently dropped ·
 * explicit acts are refused at this door · queries are normalized and
 * bounded · demand receipts collapse one attacker to one person · the
 * 90-day retention promise is kept on the cron clock.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { merchantMomentum } from '../../../server/utils/momentum'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function streetWorld() {
  const email = `maker-${uuidv7()}@street.example`
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email, password: 'a maker on the street' } })
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(reg.headers.get('set-cookie')!)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Vera' } })
  const handle = `vera-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Vera Weaves', handle } })
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
  const prod = await http.request('POST', '/api/v1/products', {
    headers: { cookie },
    body: { business_id: biz.body.business_id, title: 'Woven Runner', fulfillment_kind: 'physical', default_price: { amount: 3200, currency: 'EUR' }, publish_to_store_id: store.body.store_id },
  })
  return { businessId: biz.body.business_id as string, storeId: store.body.store_id as string, productId: prod.body.product_id as string, handle }
}

const rows = async (where = '') =>
  (await container.pool.query(`SELECT * FROM attention_facts ${where} ORDER BY occurred_at`)).rows

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

describe('LS-1 — the beacon records honestly and mints nothing', () => {
  it('a real batch lands anonymous (no cookie): glances, never people — and NO cookie is set', async () => {
    const w = await streetWorld()
    const res = await http.request('POST', '/api/v1/public/attention', {
      body: { events: [
        { type: 'store_view', subject_type: 'store', subject_id: w.storeId, source: 'home' },
        { type: 'product_view', subject_type: 'product', subject_id: w.productId, source: 'storefront' },
      ] },
    })
    expect(res.status).toBe(200)
    expect(res.body.accepted).toBe(2)
    expect(res.headers.get('set-cookie') ?? '').not.toContain('dof_visitor') // passive attention NEVER mints identity
    const all = await rows()
    expect(all).toHaveLength(2)
    expect(all.every((r) => r.visitor_id === null)).toBe(true)
    expect(all.find((r) => r.event_type === 'product_view')!.store_id).toBe(w.storeId) // owner denormalized
  })

  it('an engagement-born visitor cookie attaches identity — the SAME door, now a person', async () => {
    const w = await streetWorld()
    // the cookie is born from an explicit act (follow), never from the beacon
    const follow = await http.request('POST', `/api/v1/public/stores/${w.handle}/follow`, { body: {} })
    const visitorCookie = /dof_visitor=[^;]+/.exec(follow.headers.get('set-cookie') ?? '')![0]
    const res = await http.request('POST', '/api/v1/public/attention', {
      headers: { cookie: visitorCookie },
      body: { events: [{ type: 'store_view', subject_type: 'store', subject_id: w.storeId, source: 'shops' }] },
    })
    expect(res.body.accepted).toBe(1)
    const [row] = await rows()
    expect(row.visitor_id).not.toBeNull()
  })

  it('fabricated and foreign subjects are silently dropped — no oracle, no rows', async () => {
    const w = await streetWorld()
    const res = await http.request('POST', '/api/v1/public/attention', {
      body: { events: [
        { type: 'deal_view', subject_type: 'deal', subject_id: uuidv7(), source: 'home' }, // invented
        { type: 'store_view', subject_type: 'store', subject_id: uuidv7(), source: 'home' }, // invented
        { type: 'product_view', subject_type: 'product', subject_id: w.productId, source: 'home' }, // real
      ] },
    })
    expect(res.status).toBe(200)
    expect(res.body.accepted).toBe(1) // a bare count — which ones died is not disclosed
    expect(await rows()).toHaveLength(1)
  })

  it('explicit acts are refused at this door; malformed types and oversized batches die at the schema', async () => {
    const w = await streetWorld()
    const followAct = await http.request('POST', '/api/v1/public/attention', {
      body: { events: [{ type: 'follow', subject_type: 'store', subject_id: w.storeId, source: 'home' }] },
    })
    expect(followAct.status).toBe(422) // follow/save/fire have their own doors — never recorded twice
    const oversized = await http.request('POST', '/api/v1/public/attention', {
      body: { events: Array.from({ length: 26 }, () => ({ type: 'store_view', subject_type: 'store', subject_id: w.storeId, source: 'home' })) },
    })
    expect(oversized.status).toBe(422)
    const noEvents = await http.request('POST', '/api/v1/public/attention', { body: { events: [] } })
    expect(noEvents.status).toBe(422)
    expect(await rows()).toHaveLength(0)
  })

  it('search facts: normalized, bounded, zero-result honesty kept; the click carries its query', async () => {
    const w = await streetWorld()
    const res = await http.request('POST', '/api/v1/public/attention', {
      body: { events: [
        { type: 'search', query: '  Lavender BLANKET  ', had_results: true, source: 'home' },
        { type: 'search', query: 'ceramic mugs', had_results: false, source: 'home' },
        { type: 'search_click', subject_type: 'product', subject_id: w.productId, query: 'Woven', source: 'search' },
      ] },
    })
    expect(res.body.accepted).toBe(3)
    const all = await rows()
    const search = all.filter((r) => r.event_type === 'search')
    expect(search.map((r) => r.query).sort()).toEqual(['ceramic mugs', 'lavender blanket'])
    expect(search.find((r) => r.query === 'ceramic mugs')!.had_results).toBe(false) // the missing word, kept
    const click = all.find((r) => r.event_type === 'search_click')!
    expect(click.query).toBe('woven')
    expect(click.subject_id).toBe(w.productId)
    const tooLong = await http.request('POST', '/api/v1/public/attention', {
      body: { events: [{ type: 'search', query: 'x'.repeat(81), had_results: true, source: 'home' }] },
    })
    expect(tooLong.status).toBe(422)
  })

  it('the demand receipt collapses one attacker to one person; glances never inflate people', async () => {
    const w = await streetWorld()
    const follow = await http.request('POST', `/api/v1/public/stores/${w.handle}/follow`, { body: {} })
    const visitorCookie = /dof_visitor=[^;]+/.exec(follow.headers.get('set-cookie') ?? '')![0]
    // one known visitor hammers 10 views; 3 anonymous glances pass through
    for (let i = 0; i < 2; i++) {
      await http.request('POST', '/api/v1/public/attention', {
        headers: { cookie: visitorCookie },
        body: { events: Array.from({ length: 5 }, () => ({ type: 'store_view', subject_type: 'store', subject_id: w.storeId, source: 'home' })) },
      })
    }
    await http.request('POST', '/api/v1/public/attention', {
      body: { events: Array.from({ length: 3 }, () => ({ type: 'store_view', subject_type: 'store', subject_id: w.storeId, source: 'search' })) },
    })
    const momentum = await container.deps.uow.withTransaction((tx) => merchantMomentum(tx, w.businessId))
    expect(momentum.attention_this_week).toEqual({ people: 1, glances: 3, top_source: 'home' })
  })

  it('the 90-day retention promise is kept on the cron clock', async () => {
    const w = await streetWorld()
    await container.pool.query(
      `INSERT INTO attention_facts (id, event_type, subject_type, subject_id, store_id, source, occurred_at)
       VALUES ($1, 'store_view', 'store', $2, $2, 'home', now() - interval '91 days'),
              ($3, 'store_view', 'store', $2, $2, 'home', now() - interval '1 day')`,
      [uuidv7(), w.storeId, uuidv7()])
    const cron = await http.request('GET', '/api/internal/outbox-dispatch')
    expect(cron.status).toBe(200)
    expect(cron.body.attention_purged).toBe(1)
    const remaining = await rows()
    expect(remaining).toHaveLength(1) // the young fact survives; the old one is gone
  })
})
