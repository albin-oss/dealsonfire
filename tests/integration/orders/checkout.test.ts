/**
 * Checkout saga + the immutable Order (Commerce Foundation C3 — ADR-007) over real
 * HTTP + embedded PG. The laws on stage: one attempt key → at most one order in every
 * interleaving (A7-2, THE STORM), compensation on decline (K2: reservations released,
 * nothing kept), fail-closed quoting (CART_CHANGED under the visibility conjunction),
 * the honest out-of-stock answer, the buyer gate (someone else's order is a 404), and
 * the frozen `orders.order.placed` fact.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function merchant() {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `c3-${uuidv7()}@example.com`, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle } })
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
  return { cookie, businessId: biz.body.business_id, storeId: store.body.store_id, handle }
}

async function shelvedVariant(m: Awaited<ReturnType<typeof merchant>>, title = 'Lavender blanket', priceMinor = 4500) {
  const res = await http.request('POST', '/api/v1/products', {
    headers: { cookie: m.cookie },
    body: { business_id: m.businessId, title, fulfillment_kind: 'physical', default_price: { amount: priceMinor, currency: 'EUR' }, publish_to_store_id: m.storeId },
  })
  expect(res.status).toBe(201)
  const pub = await http.request('GET', `/api/v1/public/stores/${m.handle}/products/${res.body.product_id}`)
  return { productId: res.body.product_id as string, variantId: pub.body.product.variants[0].id as string }
}

function visitorCookie(headers: Headers): string {
  const set = headers.get('set-cookie') ?? ''
  return `dof_visitor=${/dof_visitor=([^;]+)/.exec(set)![1]}`
}

/** A buyer with a filled cart: returns their cookie + cart id. */
async function filledCart(variantId: string, quantity = 1) {
  const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: variantId, quantity } })
  expect(add.status).toBe(200)
  return { cookie: visitorCookie(add.headers), cartId: add.body.cart_id as string }
}

const CONTACT = { name: 'Jonas', email: 'jonas@example.com' }
const DELIVERY = { line1: 'Kerkstraat 1', city: 'Antwerp', postal_code: '2000', country: 'BE' }

const checkout = (cookie: string, cartId: string, attemptKey: string) =>
  http.request('POST', '/api/v1/public/checkout', {
    headers: { cookie }, body: { attempt_key: attemptKey, cart_id: cartId, contact: CONTACT, delivery: DELIVERY },
  })

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('the checkout saga (ADR-007)', () => {
  it('cart → placed order: snapshots frozen, timeline opened, event emitted, cart consumed', async () => {
    const m = await merchant()
    const { variantId } = await shelvedVariant(m)
    const buyer = await filledCart(variantId, 2)

    const res = await checkout(buyer.cookie, buyer.cartId, uuidv7())
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.order_number).toBe('#1')

    const order = await http.request('GET', `/api/v1/public/orders/${res.body.order_id}`, { headers: { cookie: buyer.cookie } })
    expect(order.status).toBe(200)
    expect(order.body.order.state).toBe('placed')
    expect(order.body.order.total_minor).toBe(9000)
    expect(order.body.lines).toHaveLength(1)
    expect(order.body.lines[0].title).toBe('Lavender blanket')
    expect(order.body.lines[0].line_state).toBe('reserved')
    expect(order.body.timeline.map((t: { entry_type: string }) => t.entry_type)).toEqual(['placed'])

    // the frozen fact landed
    const { rows } = await container.pool.query(`SELECT payload FROM orders_domain_events WHERE event_type = 'orders.order.placed'`)
    expect(rows).toHaveLength(1)
    expect(rows[0].payload.order_id).toBe(res.body.order_id)

    // the cart was consumed
    const cart = await http.request('GET', '/api/v1/public/cart', { headers: { cookie: buyer.cookie } })
    expect(cart.body.carts.find((c: { cart_id: string }) => c.cart_id === buyer.cartId)).toBeUndefined()

    // the buyer gate: another visitor's read is an indistinguishable 404
    const stranger = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: variantId, quantity: 1 } })
    const other = await http.request('GET', `/api/v1/public/orders/${res.body.order_id}`, { headers: { cookie: visitorCookie(stranger.headers) } })
    expect(other.status).toBe(404)
  })

  it('THE STORM: one attempt key, 8 concurrent submits — exactly one order in the universe', async () => {
    const m = await merchant()
    const { variantId } = await shelvedVariant(m)
    const buyer = await filledCart(variantId)
    const attemptKey = uuidv7()

    const results = await Promise.all(Array.from({ length: 8 }, () => checkout(buyer.cookie, buyer.cartId, attemptKey)))
    const oks = results.filter((r) => r.status === 200 && r.body.ok)
    expect(oks.length).toBe(8) // every submit converges on success…
    const orderIds = new Set(oks.map((r) => r.body.order_id))
    expect(orderIds.size).toBe(1) // …and on the SAME order
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM orders`)
    expect(rows[0].n).toBe(1)
  })

  it('payment declined: NOTHING persists (the strongest compensation), cart intact, retry honest', async () => {
    const m = await merchant()
    const { variantId } = await shelvedVariant(m, 'Cursed blanket', 66600) // sandbox decline amount
    const buyer = await filledCart(variantId)
    const attemptKey = uuidv7()

    const res = await checkout(buyer.cookie, buyer.cartId, attemptKey)
    expect(res.body.ok).toBe(false)
    expect(res.body.code).toBe('PAYMENT_DECLINED')
    expect(res.body.detail).toMatch(/Nothing was charged/)

    // C3 single-tx law: a failed checkout leaves NO trace — no claims, no attempt
    expect((await container.pool.query(`SELECT count(*)::int AS n FROM reservations`)).rows[0].n).toBe(0)
    expect((await container.pool.query(`SELECT count(*)::int AS n FROM checkout_attempts`)).rows[0].n).toBe(0)
    // the cart survives for another try
    const cart = await http.request('GET', '/api/v1/public/cart', { headers: { cookie: buyer.cookie } })
    expect(cart.body.carts).toHaveLength(1)
    // a same-key retry re-runs and answers the same honest decline (deterministic)
    const replay = await checkout(buyer.cookie, buyer.cartId, attemptKey)
    expect(replay.body.code).toBe('PAYMENT_DECLINED')
    expect((await container.pool.query(`SELECT count(*)::int AS n FROM orders`)).rows[0].n).toBe(0)
  })

  it('out of stock: the educating decline, claims released', async () => {
    const m = await merchant()
    const { variantId } = await shelvedVariant(m)
    // track the variant with a single unit
    const locationId = uuidv7()
    await container.pool.query(`INSERT INTO locations (id, business_id, kind, name, is_default) VALUES ($1, $2, 'home', 'Ghost', true)`, [locationId, m.businessId])
    const stockItemId = uuidv7()
    await container.pool.query(
      `INSERT INTO stock_items (id, business_id, variant_id, location_id, tracking_mode, on_hand) VALUES ($1, $2, $3, $4, 'tracked', 1)`,
      [stockItemId, m.businessId, variantId, locationId])

    const buyer = await filledCart(variantId, 2) // wants two, one exists
    const res = await checkout(buyer.cookie, buyer.cartId, uuidv7())
    expect(res.body.ok).toBe(false)
    expect(res.body.code).toBe('OUT_OF_STOCK')
    expect(res.body.detail).toMatch(/Only 1/)
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM reservations WHERE status = 'active'`)
    expect(rows[0].n).toBe(0)
  })

  it('CART_CHANGED: a hidden product fails the quote closed — nothing reserved, nothing placed', async () => {
    const m = await merchant()
    const { productId, variantId } = await shelvedVariant(m)
    const buyer = await filledCart(variantId)
    await http.request('POST', `/api/v1/products/${productId}/unpublish-from-store?business_id=${m.businessId}`, {
      headers: { cookie: m.cookie, 'idempotency-key': uuidv7() }, body: { store_id: m.storeId },
    })
    const res = await checkout(buyer.cookie, buyer.cartId, uuidv7())
    expect(res.body.ok).toBe(false)
    expect(res.body.code).toBe('CART_CHANGED')
    expect((await container.pool.query(`SELECT count(*)::int AS n FROM reservations`)).rows[0].n).toBe(0)
  })

  it('order history: the buyer sees their shelf, newest first; numbers count per store', async () => {
    const m = await merchant()
    const a = await shelvedVariant(m, 'Blanket')
    const b = await shelvedVariant(m, 'Scarf', 2200)
    const buyer = await filledCart(a.variantId)
    const first = await checkout(buyer.cookie, buyer.cartId, uuidv7())
    expect(first.body.ok).toBe(true)

    const add2 = await http.request('POST', '/api/v1/public/cart/lines', { headers: { cookie: buyer.cookie }, body: { variant_id: b.variantId, quantity: 1 } })
    const second = await checkout(buyer.cookie, add2.body.cart_id, uuidv7())
    expect(second.body.ok).toBe(true)
    expect(second.body.order_number).toBe('#2')

    const list = await http.request('GET', '/api/v1/public/orders', { headers: { cookie: buyer.cookie } })
    expect(list.body.items).toHaveLength(2)
    expect(list.body.items[0].id).toBe(second.body.order_id)
  })
})
