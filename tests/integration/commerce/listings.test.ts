/**
 * Listings (VISIBILITY_CONTRACT; PR-1) over real HTTP + embedded PG. The full intent
 * lifecycle: create-with-publication → shelf shows it (listing truth, interim rule
 * retired) → unpublish → shelf hides it, product intact → republish → back. Archive
 * auto-ends via the real dispatcher. Tenant probes are masked. Events + audit land.
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
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `l-${uuidv7()}@example.com`, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle } })
  return { cookie, businessId: biz.body.business_id, storeId: store.body.store_id, handle }
}

async function createProduct(cookie: string, businessId: string, opts: { publishTo?: string; title?: string } = {}) {
  const res = await http.request('POST', '/api/v1/products', {
    headers: { cookie },
    body: {
      business_id: businessId, title: opts.title ?? 'Lavender blanket', fulfillment_kind: 'physical',
      default_price: { amount: 4500, currency: 'EUR' },
      ...(opts.publishTo ? { publish_to_store_id: opts.publishTo } : {}),
    },
  })
  expect(res.status).toBe(201)
  return res.body.product_id as string
}

async function shelfTitles(handle: string): Promise<string[]> {
  const res = await http.request('GET', `/api/v1/public/stores/${handle}`)
  return res.status === 200 ? res.body.products.map((p: { title: string }) => p.title) : []
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('the shelf is listing truth (interim rule retired)', () => {
  it('a priced product WITHOUT publication no longer appears; with publication it does', async () => {
    const m = await merchant()
    await createProduct(m.cookie, m.businessId, { title: 'Backstage scarf' }) // priced, unpublished
    await createProduct(m.cookie, m.businessId, { title: 'Lavender blanket', publishTo: m.storeId })
    await http.request('POST', `/api/v1/stores/${m.storeId}/publish`, { headers: { cookie: m.cookie } })

    expect(await shelfTitles(m.handle)).toEqual(['Lavender blanket']) // the old rule would have shown both
  })
})

describe('publish ⇄ unpublish (merchant intent, VISIBILITY_CONTRACT §6)', () => {
  it('unpublish takes it off the store — the product survives untouched; republish returns it', async () => {
    const m = await merchant()
    const productId = await createProduct(m.cookie, m.businessId, { publishTo: m.storeId })
    await http.request('POST', `/api/v1/stores/${m.storeId}/publish`, { headers: { cookie: m.cookie } })
    expect(await shelfTitles(m.handle)).toHaveLength(1)

    const off = await http.request('POST', `/api/v1/products/${productId}/unpublish-from-store`, {
      headers: { cookie: m.cookie }, body: { store_id: m.storeId },
    })
    expect(off.body).toMatchObject({ status: 'unpublished', changed: true })
    expect(await shelfTitles(m.handle)).toHaveLength(0)
    // authoring untouched (V5): the product is still there, still draft
    const product = await http.request('GET', `/api/v1/products/${productId}`, { headers: { cookie: m.cookie } })
    expect(product.status).toBe(200)

    const on = await http.request('POST', `/api/v1/products/${productId}/publish-to-store`, {
      headers: { cookie: m.cookie }, body: { store_id: m.storeId },
    })
    expect(on.body).toMatchObject({ status: 'published', changed: true })
    expect(await shelfTitles(m.handle)).toHaveLength(1)
  })

  it('replays are silent (V4) and both intent acts are evented + audited (§7/§17)', async () => {
    const m = await merchant()
    const productId = await createProduct(m.cookie, m.businessId, { publishTo: m.storeId })
    const again = await http.request('POST', `/api/v1/products/${productId}/publish-to-store`, {
      headers: { cookie: m.cookie }, body: { store_id: m.storeId },
    })
    expect(again.body.changed).toBe(false) // already published — no event material

    await http.request('POST', `/api/v1/products/${productId}/unpublish-from-store`, {
      headers: { cookie: m.cookie }, body: { store_id: m.storeId },
    })
    const { rows: events } = await container.pool.query(
      `SELECT event_type FROM commerce_domain_events WHERE event_type LIKE 'commerce.listing.%' ORDER BY occurred_at`)
    expect(events.map((e) => e.event_type)).toEqual(['commerce.listing.published', 'commerce.listing.unpublished'])
    const { rows: audits } = await container.pool.query(
      `SELECT command FROM commerce_audit_logs WHERE command LIKE 'commerce.listing.%'`)
    expect(audits.length).toBe(2)
    // payloads validate at the dispatcher (M-6)
    const drained = await container.commerce.dispatcher.dispatchPending()
    expect(drained.failed).toBe(0)
  })

  it('publishing an unpriced product is refused with educating copy', async () => {
    const m = await merchant()
    const res = await http.request('POST', '/api/v1/products', {
      headers: { cookie: m.cookie },
      body: { business_id: m.businessId, title: 'Unfinished scarf', fulfillment_kind: 'physical', default_price: { amount: 0, currency: 'EUR' } },
    })
    const denied = await http.request('POST', `/api/v1/products/${res.body.product_id}/publish-to-store`, {
      headers: { cookie: m.cookie }, body: { store_id: m.storeId },
    })
    expect(denied.status).toBe(422)
    expect(denied.body.detail).toMatch(/price/)
  })
})

describe('archive auto-ends (§8, via the real dispatcher)', () => {
  it('product archived → listing ended → gone from the shelf; restore + republish returns it', async () => {
    const m = await merchant()
    const productId = await createProduct(m.cookie, m.businessId, { publishTo: m.storeId })
    await http.request('POST', `/api/v1/stores/${m.storeId}/publish`, { headers: { cookie: m.cookie } })

    await http.request('POST', `/api/v1/products/${productId}/archive`, { headers: { cookie: m.cookie } })
    const drained = await container.commerce.dispatcher.dispatchPending()
    expect(drained.failed).toBe(0)

    const { rows } = await container.pool.query(`SELECT status FROM listings WHERE product_id = $1`, [productId])
    expect(rows[0].status).toBe('ended')
    expect(await shelfTitles(m.handle)).toHaveLength(0)

    await http.request('POST', `/api/v1/products/${productId}/restore`, { headers: { cookie: m.cookie } })
    const back = await http.request('POST', `/api/v1/products/${productId}/publish-to-store`, {
      headers: { cookie: m.cookie }, body: { store_id: m.storeId },
    })
    expect(back.body).toMatchObject({ status: 'published', changed: true })
    expect(await shelfTitles(m.handle)).toHaveLength(1)
  })
})

describe('tenant safety (§15)', () => {
  it('another merchant cannot publish or unpublish my product — masked 404', async () => {
    const mine = await merchant()
    const productId = await createProduct(mine.cookie, mine.businessId, { publishTo: mine.storeId })
    const intruder = await merchant()
    const probe = await http.request('POST', `/api/v1/products/${productId}/publish-to-store`, {
      headers: { cookie: intruder.cookie }, body: { store_id: intruder.storeId },
    })
    expect(probe.status).toBe(404)
  })

  it('publishing to a store outside the product\'s business is masked', async () => {
    const mine = await merchant()
    const other = await merchant()
    const productId = await createProduct(mine.cookie, mine.businessId)
    const cross = await http.request('POST', `/api/v1/products/${productId}/publish-to-store`, {
      headers: { cookie: mine.cookie }, body: { store_id: other.storeId },
    })
    expect(cross.status).toBe(404)
  })
})

describe('the public product page read (Release 0.2)', () => {
  it('serves a visible product with brand context; hidden/unknown are identical 404s', async () => {
    const m = await merchant()
    const productId = await createProduct(m.cookie, m.businessId, { publishTo: m.storeId })
    await http.request('POST', `/api/v1/stores/${m.storeId}/publish`, { headers: { cookie: m.cookie } })

    const live = await http.request('GET', `/api/v1/public/stores/${m.handle}/products/${productId}`)
    expect(live.status).toBe(200)
    expect(live.body.product).toMatchObject({ title: 'Lavender blanket', price_minor: 4500 })
    expect(live.body.store.handle).toBe(m.handle)
    expect(live.headers.get('cache-control')).toContain('public')

    await http.request('POST', `/api/v1/products/${productId}/unpublish-from-store`, {
      headers: { cookie: m.cookie }, body: { store_id: m.storeId },
    })
    const hidden = await http.request('GET', `/api/v1/public/stores/${m.handle}/products/${productId}`)
    const unknown = await http.request('GET', `/api/v1/public/stores/${m.handle}/products/${uuidv7()}`)
    expect(hidden.status).toBe(404)
    expect(unknown.status).toBe(404)
    expect(hidden.body.code).toBe(unknown.body.code) // V6: no oracle
  })
})

describe('the merchant grid speaks merchant language (on_store)', () => {
  it('annotates rows with on_store for the channel', async () => {
    const m = await merchant()
    await createProduct(m.cookie, m.businessId, { title: 'On it', publishTo: m.storeId })
    await createProduct(m.cookie, m.businessId, { title: 'Backstage' })
    const res = await http.request('GET', `/api/v1/products?business_id=${m.businessId}&limit=10&channel_id=${m.storeId}`, {
      headers: { cookie: m.cookie },
    })
    const byTitle = Object.fromEntries(res.body.items.map((i: { title: string; on_store: boolean }) => [i.title, i.on_store]))
    expect(byTitle).toEqual({ 'On it': true, Backstage: false })
  })
})
