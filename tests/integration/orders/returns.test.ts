/**
 * Returns (Commerce Foundation C9) over real HTTP + embedded PG. The lifecycle
 * with ONE decision point; hostile scenarios: (5) resolution repeats converge
 * quietly, (7) one line of several returns while the rest stays fulfilled,
 * (10) two racing resolvers — the second changes nothing. Returns APPEND: the
 * order's state never rewinds. Money: bounded, cause-keyed, L3 clean.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import type { SandboxMailer } from '@platform/mail'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const inTx = <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
  container.deps.uow.withTransaction(fn as never) as Promise<T>

async function merchant(email = `c9-${uuidv7()}@maker.example`) {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle } })
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
  return { cookie, businessId: biz.body.business_id, storeId: store.body.store_id, handle, email }
}

async function shelved(m: Awaited<ReturnType<typeof merchant>>, title: string, priceMinor: number, tracked = false) {
  const res = await http.request('POST', '/api/v1/products', {
    headers: { cookie: m.cookie },
    body: { business_id: m.businessId, title, fulfillment_kind: 'physical', default_price: { amount: priceMinor, currency: 'EUR' }, publish_to_store_id: m.storeId },
  })
  const pub = await http.request('GET', `/api/v1/public/stores/${m.handle}/products/${res.body.product_id}`)
  const variantId = pub.body.product.variants[0].id as string
  if (tracked) {
    const locationId = uuidv7()
    await container.pool.query(`INSERT INTO locations (id, business_id, kind, name, is_default) VALUES ($1, $2, 'home', 'Ghost', true)`, [locationId, m.businessId])
    await container.pool.query(
      `INSERT INTO stock_items (id, business_id, variant_id, location_id, tracking_mode, on_hand) VALUES ($1, $2, $3, $4, 'tracked', 5)`,
      [uuidv7(), m.businessId, variantId, locationId])
  }
  return { variantId }
}

async function buyAndShip(m: Awaited<ReturnType<typeof merchant>>, variants: Array<{ id: string; qty: number }>) {
  let cookie: string | null = null
  let cartId = ''
  for (const v of variants) {
    const add = await http.request('POST', '/api/v1/public/cart/lines', { headers: cookie ? { cookie } : {}, body: { variant_id: v.id, quantity: v.qty } })
    cookie = cookie ?? `dof_visitor=${/dof_visitor=([^;]+)/.exec(add.headers.get('set-cookie') ?? '')![1]}`
    cartId = add.body.cart_id
  }
  const co = await http.request('POST', '/api/v1/public/checkout', {
    headers: { cookie: cookie! },
    body: { attempt_key: uuidv7(), cart_id: cartId, contact: { name: 'Jonas', email: 'jonas@buyer.example' }, delivery: { line1: 'K 1', city: 'A', postal_code: '2000', country: 'BE' } },
  })
  expect(co.body.ok).toBe(true)
  const orderId = co.body.order_id as string
  await http.request('POST', `/api/v1/orders/${orderId}/dispatch`, { headers: { cookie: m.cookie }, body: { carrier: 'bpost' } })
  return { cookie: cookie!, orderId }
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => {
  await truncateAll(container.pool)
  ;(container.rateLimiter as { reset?: () => void }).reset?.()
  ;(container.mail as SandboxMailer).outbox.length = 0
})

describe('C9 — returns', () => {
  it('scenario 7: one of two lines returns — authorize, track, resolve; the order APPENDS, never rewinds', async () => {
    const m = await merchant()
    const a = await shelved(m, 'Blanket', 4500, true)
    const b = await shelved(m, 'Scarf', 2200)
    const { cookie, orderId } = await buyAndShip(m, [{ id: a.variantId, qty: 1 }, { id: b.variantId, qty: 1 }])

    const ask = await http.request('POST', `/api/v1/public/orders/${orderId}/return`, {
      headers: { cookie }, body: { line_nos: [1], reason_code: 'not_as_described', comment: 'colour is off' } })
    expect(ask.body.outcome).toBe('requested')

    const auth = await http.request('POST', `/api/v1/orders/${orderId}/return-decision`, {
      headers: { cookie: m.cookie }, body: { action: 'authorize', instructions: 'Original wrap if you still have it.' } })
    expect(auth.body.outcome).toBe('authorized')

    const track = await http.request('POST', `/api/v1/public/orders/${orderId}/return`, {
      headers: { cookie }, body: { tracking_ref: 'RET-BE-1' } })
    expect(track.body.outcome).toBe('tracking_recorded')

    const resolve = await http.request('POST', `/api/v1/orders/${orderId}/return-decision`, {
      headers: { cookie: m.cookie }, body: { action: 'resolve', disposition: 'restock' } })
    expect(resolve.body.outcome).toBe('resolved')
    expect(resolve.body.refunded_minor).toBe(4500)

    const order = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    const states = Object.fromEntries(order.body.lines.map((l: { line_no: number; line_state: string }) => [l.line_no, l.line_state]))
    expect(states[1]).toBe('returned')
    expect(states[2]).toBe('fulfilled')       // the scarf lives on
    expect(order.body.order.state).toBe('fulfilled') // returns APPEND — no rewind
    expect(JSON.stringify(order.body.timeline)).toMatch(/received and checked/)
    // the blanket is back on the tracked shelf
    const { rows: stock } = await container.pool.query(`SELECT on_hand FROM stock_items`)
    expect(stock[0].on_hand).toBe(5)
    // money: bounded and clean
    const { rows: intents } = await container.pool.query(`SELECT refunded_minor::int AS r FROM payment_intents`)
    expect(intents[0].r).toBe(4500)
    const check = await inTx((tx) => container.payments.service.ledger.recomputeCheck(tx as never))
    expect(check.clean).toBe(true)

    // the letters: requested (merchant), authorized (buyer), resolved (buyer)
    await container.operations.dispatcher.dispatchPending()
    const letters = (container.mail as SandboxMailer).outbox.map((msg) => `${msg.to}|${msg.subject}`)
    expect(letters.some((l) => l.includes(m.email) && l.includes('send something back'))).toBe(true)
    expect(letters.some((l) => l.includes('jonas@buyer.example') && l.includes('send it back'))).toBe(true)
    expect(letters.some((l) => l.includes('jonas@buyer.example') && l.includes('settled'))).toBe(true)
  })

  it('scenarios 5 + 10: resolution repeats and racing operators change NOTHING', async () => {
    const m = await merchant()
    const { variantId } = await shelved(m, 'Blanket', 4500)
    const { cookie, orderId } = await buyAndShip(m, [{ id: variantId, qty: 1 }])
    await http.request('POST', `/api/v1/public/orders/${orderId}/return`, { headers: { cookie }, body: { reason_code: 'damaged' } })
    await http.request('POST', `/api/v1/orders/${orderId}/return-decision`, { headers: { cookie: m.cookie }, body: { action: 'authorize' } })

    const [first, second] = await Promise.all([
      http.request('POST', `/api/v1/orders/${orderId}/return-decision`, { headers: { cookie: m.cookie }, body: { action: 'resolve' } }),
      http.request('POST', `/api/v1/orders/${orderId}/return-decision`, { headers: { cookie: m.cookie }, body: { action: 'resolve' } }),
    ])
    const amounts = [first.body.refunded_minor ?? 0, second.body.refunded_minor ?? 0].sort((x, y) => x - y)
    expect(amounts).toEqual([0, 4500]) // exactly one act of money
    const third = await http.request('POST', `/api/v1/orders/${orderId}/return-decision`, { headers: { cookie: m.cookie }, body: { action: 'resolve' } })
    expect([0, undefined]).toContain(third.body.refunded_minor)
    const { rows } = await container.pool.query(`SELECT refunded_minor::int AS r FROM payment_intents`)
    expect(rows[0].r).toBe(4500) // once, ever
  })

  it('generosity (RT1): refund WITHOUT the send-back, straight from requested; no restock', async () => {
    const m = await merchant()
    const { variantId } = await shelved(m, 'Blanket', 4500, true)
    const { cookie, orderId } = await buyAndShip(m, [{ id: variantId, qty: 1 }])
    await http.request('POST', `/api/v1/public/orders/${orderId}/return`, { headers: { cookie }, body: { reason_code: 'damaged' } })

    const resolve = await http.request('POST', `/api/v1/orders/${orderId}/return-decision`, {
      headers: { cookie: m.cookie }, body: { action: 'resolve', without_return: true, disposition: 'discard' } })
    expect(resolve.body.outcome).toBe('resolved')
    expect(resolve.body.refunded_minor).toBe(4500)
    const order = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(JSON.stringify(order.body.timeline)).toMatch(/without needing the send-back/)
    const { rows: stock } = await container.pool.query(`SELECT on_hand FROM stock_items`)
    expect(stock[0].on_hand).toBe(4) // sold and kept by the buyer — no phantom restock
  })

  it('the window closes honestly; declines say so plainly', async () => {
    const m = await merchant()
    const { variantId } = await shelved(m, 'Blanket', 4500)
    const { cookie, orderId } = await buyAndShip(m, [{ id: variantId, qty: 1 }])
    await container.pool.query(`UPDATE fulfillment_cases SET dispatched_at = now() - interval '31 days' WHERE order_id = $1`, [orderId])
    const late = await http.request('POST', `/api/v1/public/orders/${orderId}/return`, { headers: { cookie }, body: { reason_code: 'other' } })
    expect(late.status).toBe(409)
    expect(late.body.detail).toMatch(/window has closed/)

    await container.pool.query(`UPDATE fulfillment_cases SET dispatched_at = now() WHERE order_id = $1`, [orderId])
    await http.request('POST', `/api/v1/public/orders/${orderId}/return`, { headers: { cookie }, body: { reason_code: 'changed_mind' } })
    const decline = await http.request('POST', `/api/v1/orders/${orderId}/return-decision`, {
      headers: { cookie: m.cookie }, body: { action: 'decline', instructions: 'made to order, as noted on the page' } })
    expect(decline.body.outcome).toBe('declined')
    const order = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(JSON.stringify(order.body.timeline)).toMatch(/keeping the order as delivered/)
  })
})
