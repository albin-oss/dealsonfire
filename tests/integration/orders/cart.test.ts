/**
 * Cart Foundation (Commerce Foundation C1 — ADR-007 §4) over real HTTP + embedded PG.
 * The C-invariants on stage: one active cart per (buyer, store) (C1), prices re-quoted
 * on read — the cart never asserts price truth (C2), no reservations ever (C3, proven
 * by absence). Plus the street's identity story: the visitor cookie mints on first add,
 * merge-on-login is a quantity-max line-union, and hidden variants answer the
 * indistinguishable 404 (V6). The abandonment sweep emits the frozen taxonomy fact.
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
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `c-${uuidv7()}@example.com`, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle } })
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
  return { cookie, businessId: biz.body.business_id, storeId: store.body.store_id, handle }
}

async function shelvedVariant(m: Awaited<ReturnType<typeof merchant>>, title = 'Lavender blanket'): Promise<{ productId: string; variantId: string }> {
  const res = await http.request('POST', '/api/v1/products', {
    headers: { cookie: m.cookie },
    body: {
      business_id: m.businessId, title, fulfillment_kind: 'physical',
      default_price: { amount: 4500, currency: 'EUR' }, publish_to_store_id: m.storeId,
    },
  })
  expect(res.status).toBe(201)
  const pub = await http.request('GET', `/api/v1/public/stores/${m.handle}/products/${res.body.product_id}`)
  expect(pub.status).toBe(200)
  return { productId: res.body.product_id as string, variantId: pub.body.product.variants[0].id as string }
}

function visitorCookie(headers: Headers): string {
  const set = headers.get('set-cookie') ?? ''
  const match = /dof_visitor=([^;]+)/.exec(set)
  expect(match, 'expected a dof_visitor cookie').not.toBeNull()
  return `dof_visitor=${match![1]}`
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('the cart as a working document', () => {
  it('first add mints the visitor; set is idempotent by (buyer, variant); 0 removes', async () => {
    const m = await merchant()
    const { variantId } = await shelvedVariant(m)

    const first = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: variantId, quantity: 1 } })
    expect(first.status).toBe(200)
    const cookie = visitorCookie(first.headers)

    // absolute-set semantics: replaying the same set changes nothing
    await http.request('POST', '/api/v1/public/cart/lines', { headers: { cookie }, body: { variant_id: variantId, quantity: 3 } })
    await http.request('POST', '/api/v1/public/cart/lines', { headers: { cookie }, body: { variant_id: variantId, quantity: 3 } })

    const read = await http.request('GET', '/api/v1/public/cart', { headers: { cookie } })
    expect(read.status).toBe(200)
    expect(read.body.carts).toHaveLength(1)
    expect(read.body.carts[0].lines).toHaveLength(1)
    expect(read.body.carts[0].lines[0].quantity).toBe(3)
    expect(read.body.carts[0].subtotal_minor).toBe(3 * 4500)

    const removed = await http.request('POST', '/api/v1/public/cart/lines', { headers: { cookie }, body: { variant_id: variantId, quantity: 0 } })
    expect(removed.status).toBe(200)
    const after = await http.request('GET', '/api/v1/public/cart', { headers: { cookie } })
    expect(after.body.carts[0]?.lines ?? []).toHaveLength(0)
  })

  it('C1: one active cart per (buyer, store); a second store gets its own cart', async () => {
    const m1 = await merchant()
    const m2 = await merchant()
    const a = await shelvedVariant(m1, 'Blanket')
    const b = await shelvedVariant(m1, 'Scarf')
    const c = await shelvedVariant(m2, 'Mug')

    const first = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: a.variantId, quantity: 1 } })
    const cookie = visitorCookie(first.headers)
    await http.request('POST', '/api/v1/public/cart/lines', { headers: { cookie }, body: { variant_id: b.variantId, quantity: 2 } })
    await http.request('POST', '/api/v1/public/cart/lines', { headers: { cookie }, body: { variant_id: c.variantId, quantity: 1 } })

    const read = await http.request('GET', '/api/v1/public/cart', { headers: { cookie } })
    expect(read.body.carts).toHaveLength(2) // one per store
    const lineCounts = read.body.carts.map((cart: { lines: unknown[] }) => cart.lines.length).sort()
    expect(lineCounts).toEqual([1, 2])
  })

  it('V6: a hidden variant answers the indistinguishable 404; carted lines render honestly after hiding', async () => {
    const m = await merchant()
    const { productId, variantId } = await shelvedVariant(m)

    const first = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: variantId, quantity: 1 } })
    const cookie = visitorCookie(first.headers)

    // the merchant takes the product off the store — the carted line survives, honestly
    await http.request('POST', `/api/v1/products/${productId}/unpublish-from-store?business_id=${m.businessId}`, {
      headers: { cookie: m.cookie, 'idempotency-key': uuidv7() }, body: { store_id: m.storeId },
    })
    const read = await http.request('GET', '/api/v1/public/cart', { headers: { cookie } })
    expect(read.body.carts[0].lines[0].available).toBe(false)
    expect(read.body.carts[0].subtotal_minor).toBe(0) // unavailable lines price out honestly

    // and a NEW add of the now-hidden variant is a masked 404
    const blocked = await http.request('POST', '/api/v1/public/cart/lines', { headers: { cookie }, body: { variant_id: variantId, quantity: 1 } })
    expect(blocked.status).toBe(404)
  })

  it('C2: the read re-quotes — a price change is live truth plus the honesty hint', async () => {
    const m = await merchant()
    const { productId, variantId } = await shelvedVariant(m)
    const first = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: variantId, quantity: 2 } })
    const cookie = visitorCookie(first.headers)

    const patched = await http.request('PATCH', `/api/v1/products/${productId}/variants/${variantId}`, {
      headers: { cookie: m.cookie },
      body: { price: { amount: 5200, currency: 'EUR' } },
    })
    expect(patched.status, JSON.stringify(patched.body)).toBe(200)

    const read = await http.request('GET', '/api/v1/public/cart', { headers: { cookie } })
    const line = read.body.carts[0].lines[0]
    expect(line.price_minor).toBe(5200)       // live truth
    expect(line.price_seen_minor).toBe(4500)  // what the buyer saw
    expect(read.body.carts[0].subtotal_minor).toBe(2 * 5200)
  })

  it('merge-on-login: line-union, quantities max — never summed', async () => {
    const m = await merchant()
    const a = await shelvedVariant(m, 'Blanket')
    const b = await shelvedVariant(m, 'Scarf')

    // device 1: the owner's original visitor identity with a cart
    const d1 = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: a.variantId, quantity: 2 } })
    const cookie1 = visitorCookie(d1.headers)
    const visitor1 = /dof_visitor=([^;]+)/.exec(cookie1)![1]!

    // the buyer registers and claims visitor1 (the corner-claim path)
    const email = `buyer-${uuidv7()}@example.com`
    const reg = await http.request('POST', '/api/v1/auth/register', { headers: { cookie: cookie1 }, body: { email, password: 'a long passphrase' } })
    expect(reg.status).toBe(201)
    const claim = await container.identity.guestClaim.claim(reg.body.user_id, 'visitor', visitor1)
    expect(claim.ok).toBe(true)

    // device 2: a fresh visitor gathers its own cart — overlapping line (qty 1) + a new one
    const d2 = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: a.variantId, quantity: 1 } })
    const cookie2 = visitorCookie(d2.headers)
    await http.request('POST', '/api/v1/public/cart/lines', { headers: { cookie: cookie2 }, body: { variant_id: b.variantId, quantity: 4 } })

    // device 2 logs in → merge into the claimed visitor, cookie flips underfoot
    const login = await http.request('POST', '/api/v1/auth/login', { headers: { cookie: cookie2 }, body: { email, password: 'a long passphrase' } })
    expect(login.status).toBe(200)
    expect(visitorCookie(login.headers)).toBe(cookie1) // restored identity

    const read = await http.request('GET', '/api/v1/public/cart', { headers: { cookie: cookie1 } })
    expect(read.body.carts).toHaveLength(1)
    const byVariant = Object.fromEntries(read.body.carts[0].lines.map((l: { variant_id: string; quantity: number }) => [l.variant_id, l.quantity]))
    expect(byVariant[a.variantId]).toBe(2) // max(2, 1) — never 3
    expect(byVariant[b.variantId]).toBe(4) // union brings the new line

    // idempotent: logging in again changes nothing
    await http.request('POST', '/api/v1/auth/login', { headers: { cookie: cookie2 }, body: { email, password: 'a long passphrase' } })
    const again = await http.request('GET', '/api/v1/public/cart', { headers: { cookie: cookie1 } })
    expect(again.body.carts[0].lines).toHaveLength(2)
  })

  it('the abandonment sweep: 30 quiet days → orders.cart.abandoned, exactly once', async () => {
    const m = await merchant()
    const { variantId } = await shelvedVariant(m)
    const first = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: variantId, quantity: 1 } })
    visitorCookie(first.headers)

    // nothing sweeps today
    const swept0 = await container.deps.uow.withTransaction((tx) => container.orders.carts.sweepAbandoned(tx))
    expect(swept0).toBe(0)

    // 31 days later: the cart abandons, the frozen fact lands, and the sweep is idempotent
    const future = new Date(Date.now() + 31 * 86_400_000)
    const swept1 = await container.deps.uow.withTransaction((tx) => container.orders.carts.sweepAbandoned(tx, future))
    expect(swept1).toBe(1)
    const swept2 = await container.deps.uow.withTransaction((tx) => container.orders.carts.sweepAbandoned(tx, future))
    expect(swept2).toBe(0)

    const { rows } = await container.pool.query(
      `SELECT event_type, payload FROM orders_domain_events WHERE event_type = 'orders.cart.abandoned'`)
    expect(rows).toHaveLength(1)
    expect(rows[0].payload.cart_id).toBeTruthy()
  })
})
