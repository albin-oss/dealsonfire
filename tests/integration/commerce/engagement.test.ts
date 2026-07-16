/**
 * Deal engagement + the discovery feed (Release 0.4) over real HTTP + embedded PG.
 * The network loop end-to-end: publish deal → it appears on the public feed → an
 * anonymous visitor fires/saves/follows (cookie identity minted on first tap, toggles
 * idempotent) → their Saved/Following shelves fill → counts flow back to the merchant.
 * Engagement obeys the full visibility conjunction (no oracle around hidden things).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function merchant(opts: { live?: boolean } = {}): Promise<{ cookie: string; businessId: string; storeId: string; handle: string }> {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `e-${uuidv7()}@example.com`, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle } })
  const m = { cookie, businessId: biz.body.business_id as string, storeId: store.body.store_id as string, handle }
  if (opts.live !== false) {
    await http.request('POST', '/api/v1/products', {
      headers: { cookie },
      body: { business_id: m.businessId, title: 'Lavender blanket', fulfillment_kind: 'physical', default_price: { amount: 4500, currency: 'EUR' }, publish_to_store_id: m.storeId },
    })
    await http.request('POST', `/api/v1/stores/${m.storeId}/publish`, { headers: { cookie } })
  }
  return m
}

async function liveDeal(m: Awaited<ReturnType<typeof merchant>>, headline = 'Weekend special'): Promise<string> {
  const products = await http.request('GET', `/api/v1/products?business_id=${m.businessId}&limit=1`, { headers: { cookie: m.cookie } })
  const res = await http.request('POST', '/api/v1/deals', {
    headers: { cookie: m.cookie },
    body: { product_id: products.body.items[0].id, store_id: m.storeId, headline },
  })
  expect(res.status).toBe(201)
  return res.body.deal_id as string
}

/** The visitor cookie from an engagement response (minted on first tap). */
function visitorCookie(headers: Headers): string {
  const set = headers.get('set-cookie') ?? ''
  const match = /dof_visitor=([^;]+)/.exec(set)
  expect(match, 'expected a dof_visitor cookie').not.toBeNull()
  return `dof_visitor=${match![1]}`
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('the network loop (Release 0.4)', () => {
  it('publish → feed → fire → toggle off/on → counts are true, per-visitor flags ride', async () => {
    const m = await merchant()
    const dealId = await liveDeal(m)

    // anonymous feed: the deal is discoverable, flags false
    const anon = await http.request('GET', '/api/v1/public/deals')
    expect(anon.body.items).toHaveLength(1)
    expect(anon.body.items[0]).toMatchObject({ id: dealId, headline: 'Weekend special', fires: 0, viewer_reacted: false })
    expect(anon.headers.get('cache-control')).toContain('private')

    // first tap mints the identity and fires the deal
    const fire1 = await http.request('POST', `/api/v1/public/deals/${dealId}/react`)
    expect(fire1.body).toEqual({ active: true, count: 1 })
    const visitor = visitorCookie(fire1.headers)

    // toggle: same visitor un-fires, then fires again — idempotent, counts true
    const fire2 = await http.request('POST', `/api/v1/public/deals/${dealId}/react`, { headers: { cookie: visitor } })
    expect(fire2.body).toEqual({ active: false, count: 0 })
    const fire3 = await http.request('POST', `/api/v1/public/deals/${dealId}/react`, { headers: { cookie: visitor } })
    expect(fire3.body).toEqual({ active: true, count: 1 })

    // the visitor's feed carries their flags; a second visitor raises the count
    await http.request('POST', `/api/v1/public/deals/${dealId}/react`)
    const mine = await http.request('GET', '/api/v1/public/deals', { headers: { cookie: visitor } })
    expect(mine.body.items[0]).toMatchObject({ fires: 2, viewer_reacted: true })

    // the merchant sees the engagement come back
    const merchantList = await http.request('GET', `/api/v1/deals?business_id=${m.businessId}`, { headers: { cookie: m.cookie } })
    expect(merchantList.body.items[0].fires).toBe(2)
  })

  it('save fills the Saved shelf; follow fills Following; both empty without identity', async () => {
    const m = await merchant()
    const dealId = await liveDeal(m)

    const saved = await http.request('POST', `/api/v1/public/deals/${dealId}/save`)
    const visitor = visitorCookie(saved.headers)
    await http.request('POST', `/api/v1/public/stores/${m.handle}/follow`, { headers: { cookie: visitor } })

    const savedShelf = await http.request('GET', '/api/v1/public/deals?filter=saved', { headers: { cookie: visitor } })
    expect(savedShelf.body.items.map((d: { id: string }) => d.id)).toEqual([dealId])
    const following = await http.request('GET', '/api/v1/public/deals?filter=following', { headers: { cookie: visitor } })
    expect(following.body.items[0]).toMatchObject({ id: dealId, viewer_follows: true })

    // no identity → the personal shelves are empty worlds, not errors
    const noIdentity = await http.request('GET', '/api/v1/public/deals?filter=saved')
    expect(noIdentity.body.items).toEqual([])

    // unsave empties the shelf
    await http.request('POST', `/api/v1/public/deals/${dealId}/save`, { headers: { cookie: visitor } })
    const emptied = await http.request('GET', '/api/v1/public/deals?filter=saved', { headers: { cookie: visitor } })
    expect(emptied.body.items).toEqual([])
  })

  it('engagement obeys the conjunction: hidden/ended deals and draft stores answer 404', async () => {
    const m = await merchant()
    const dealId = await liveDeal(m)
    const products = await http.request('GET', `/api/v1/products?business_id=${m.businessId}&limit=1`, { headers: { cookie: m.cookie } })

    // unpublish the product → the deal is unengageable AND leaves the feed
    await http.request('POST', `/api/v1/products/${products.body.items[0].id}/unpublish-from-store`, {
      headers: { cookie: m.cookie }, body: { store_id: m.storeId },
    })
    expect((await http.request('POST', `/api/v1/public/deals/${dealId}/react`)).status).toBe(404)
    expect((await http.request('GET', '/api/v1/public/deals')).body.items).toEqual([])

    // draft stores can't be followed
    const draft = await merchant({ live: false })
    expect((await http.request('POST', `/api/v1/public/stores/${draft.handle}/follow`)).status).toBe(404)

    // ended deals are unengageable
    await http.request('POST', `/api/v1/products/${products.body.items[0].id}/publish-to-store`, {
      headers: { cookie: m.cookie }, body: { store_id: m.storeId },
    })
    await http.request('POST', `/api/v1/deals/${dealId}/end`, { headers: { cookie: m.cookie }, body: { business_id: m.businessId } })
    expect((await http.request('POST', `/api/v1/public/deals/${dealId}/save`)).status).toBe(404)
  })

  it('every engagement change is evented (guest actor) + audited; replays are silent', async () => {
    const m = await merchant()
    const dealId = await liveDeal(m)

    const fire = await http.request('POST', `/api/v1/public/deals/${dealId}/react`)
    const visitor = visitorCookie(fire.headers)
    await http.request('POST', `/api/v1/public/deals/${dealId}/react`, { headers: { cookie: visitor } })
    await http.request('POST', `/api/v1/public/deals/${dealId}/save`, { headers: { cookie: visitor } })
    await http.request('POST', `/api/v1/public/stores/${m.handle}/follow`, { headers: { cookie: visitor } })

    const { rows: commerceEvents } = await container.pool.query(
      `SELECT event_type, actor->>'type' AS actor_type FROM commerce_domain_events WHERE event_type LIKE 'commerce.deal.%reacted' OR event_type LIKE 'commerce.deal.%saved' ORDER BY occurred_at`)
    expect(commerceEvents.map((e) => e.event_type)).toEqual(['commerce.deal.reacted', 'commerce.deal.unreacted', 'commerce.deal.saved'])
    expect(new Set(commerceEvents.map((e) => e.actor_type))).toEqual(new Set(['guest']))

    const { rows: followEvents } = await container.pool.query(
      `SELECT event_type FROM domain_events WHERE event_type = 'merchant.store.followed'`)
    expect(followEvents).toHaveLength(1)

    const { rows: audits } = await container.pool.query(
      `SELECT command FROM commerce_audit_logs WHERE command IN ('commerce.deal.react', 'commerce.deal.save')`)
    expect(audits).toHaveLength(3)

    expect((await container.commerce.dispatcher.dispatchPending()).failed).toBe(0)
    expect((await container.dispatcher.dispatchPending()).failed).toBe(0)
  })
})
