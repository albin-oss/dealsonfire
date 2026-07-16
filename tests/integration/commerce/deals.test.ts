/**
 * Deals (Release 0.3 — the social half) over real HTTP + embedded PG. Create requires an
 * on-store product; the public page shows deal+product iff BOTH are visible (a deal never
 * leaks a hidden product); end hides it; events + audits land; tenants are masked.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function merchant(): Promise<{ cookie: string; businessId: string; storeId: string; handle: string }> {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `d-${uuidv7()}@example.com`, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle } })
  return { cookie, businessId: biz.body.business_id, storeId: store.body.store_id, handle }
}

async function publishedProduct(m: Awaited<ReturnType<typeof merchant>>, title = 'Lavender blanket'): Promise<string> {
  const res = await http.request('POST', '/api/v1/products', {
    headers: { cookie: m.cookie },
    body: {
      business_id: m.businessId, title, fulfillment_kind: 'physical',
      default_price: { amount: 4500, currency: 'EUR' }, publish_to_store_id: m.storeId,
    },
  })
  expect(res.status).toBe(201)
  return res.body.product_id as string
}

async function createDeal(m: Awaited<ReturnType<typeof merchant>>, productId: string, headline = 'Weekend special: free shipping') {
  return http.request('POST', '/api/v1/deals', {
    headers: { cookie: m.cookie },
    body: { product_id: productId, store_id: m.storeId, headline, story: 'A short story about warmth.' },
  })
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('the deal lifecycle (merchant journey)', () => {
  it('create → public page carries deal + product + brand → end → identical 404', async () => {
    const m = await merchant()
    const productId = await publishedProduct(m)
    await http.request('POST', `/api/v1/stores/${m.storeId}/publish`, { headers: { cookie: m.cookie } })

    const created = await createDeal(m, productId)
    expect(created.status).toBe(201)
    const dealId = created.body.deal_id as string

    const live = await http.request('GET', `/api/v1/public/stores/${m.handle}/deals/${dealId}`)
    expect(live.status).toBe(200)
    expect(live.body.deal).toMatchObject({ headline: 'Weekend special: free shipping', story: 'A short story about warmth.' })
    expect(live.body.product).toMatchObject({ title: 'Lavender blanket', price_minor: 4500 })
    expect(live.body.store.handle).toBe(m.handle)
    expect(live.headers.get('cache-control')).toContain('public')

    // workspace list sees it
    const list = await http.request('GET', `/api/v1/deals?business_id=${m.businessId}`, { headers: { cookie: m.cookie } })
    expect(list.body.items).toHaveLength(1)
    expect(list.body.items[0].status).toBe('published')

    // end: the clock tells the truth
    const ended = await http.request('POST', `/api/v1/deals/${dealId}/end`, {
      headers: { cookie: m.cookie }, body: { business_id: m.businessId },
    })
    expect(ended.body.ended).toBe(true)
    const gone = await http.request('GET', `/api/v1/public/stores/${m.handle}/deals/${dealId}`)
    const unknown = await http.request('GET', `/api/v1/public/stores/${m.handle}/deals/${uuidv7()}`)
    expect(gone.status).toBe(404)
    expect(gone.body.code).toBe(unknown.body.code) // V6: no oracle

    // ending again is idempotent intent
    const again = await http.request('POST', `/api/v1/deals/${dealId}/end`, {
      headers: { cookie: m.cookie }, body: { business_id: m.businessId },
    })
    expect(again.body.ended).toBe(false)
  })

  it('a deal requires the product to be ON the store (educating refusal)', async () => {
    const m = await merchant()
    const res = await http.request('POST', '/api/v1/products', {
      headers: { cookie: m.cookie },
      body: { business_id: m.businessId, title: 'Backstage scarf', fulfillment_kind: 'physical', default_price: { amount: 2000, currency: 'EUR' } },
    })
    const denied = await createDeal(m, res.body.product_id)
    expect(denied.status).toBe(409)
    expect(denied.body.detail).toMatch(/store first/)
  })

  it('a deal never leaks a hidden product: unpublishing the product hides the deal too', async () => {
    const m = await merchant()
    const productId = await publishedProduct(m)
    await http.request('POST', `/api/v1/stores/${m.storeId}/publish`, { headers: { cookie: m.cookie } })
    const dealId = (await createDeal(m, productId)).body.deal_id

    await http.request('POST', `/api/v1/products/${productId}/unpublish-from-store`, {
      headers: { cookie: m.cookie }, body: { store_id: m.storeId },
    })
    expect((await http.request('GET', `/api/v1/public/stores/${m.handle}/deals/${dealId}`)).status).toBe(404)

    // republish → the deal is back, untouched (its own status never changed)
    await http.request('POST', `/api/v1/products/${productId}/publish-to-store`, {
      headers: { cookie: m.cookie }, body: { store_id: m.storeId },
    })
    expect((await http.request('GET', `/api/v1/public/stores/${m.handle}/deals/${dealId}`)).status).toBe(200)
  })

  it('deal acts are evented + audited and payloads validate at the dispatcher', async () => {
    const m = await merchant()
    const productId = await publishedProduct(m)
    const dealId = (await createDeal(m, productId)).body.deal_id
    await http.request('POST', `/api/v1/deals/${dealId}/end`, {
      headers: { cookie: m.cookie }, body: { business_id: m.businessId },
    })
    const { rows: events } = await container.pool.query(
      `SELECT event_type FROM commerce_domain_events WHERE event_type LIKE 'commerce.deal.%' ORDER BY occurred_at`)
    expect(events.map((e) => e.event_type)).toEqual(['commerce.deal.published', 'commerce.deal.ended'])
    const { rows: audits } = await container.pool.query(
      `SELECT command FROM commerce_audit_logs WHERE command LIKE 'commerce.deal.%'`)
    expect(audits).toHaveLength(2)
    const drained = await container.commerce.dispatcher.dispatchPending()
    expect(drained.failed).toBe(0)
  })

  it('tenant probes are masked: another merchant cannot create, list, or end my deals', async () => {
    const alice = await merchant()
    const mallory = await merchant()
    const productId = await publishedProduct(alice)
    const dealId = (await createDeal(alice, productId)).body.deal_id

    const forgedCreate = await http.request('POST', '/api/v1/deals', {
      headers: { cookie: mallory.cookie },
      body: { product_id: productId, store_id: alice.storeId, headline: 'Not my product' },
    })
    expect(forgedCreate.status).toBe(404) // product masked

    const forgedList = await http.request('GET', `/api/v1/deals?business_id=${alice.businessId}`, { headers: { cookie: mallory.cookie } })
    expect(forgedList.status).toBe(404)

    const forgedEnd = await http.request('POST', `/api/v1/deals/${dealId}/end`, {
      headers: { cookie: mallory.cookie }, body: { business_id: alice.businessId },
    })
    expect(forgedEnd.status).toBe(404)
  })
})
