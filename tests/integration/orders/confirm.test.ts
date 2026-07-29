/**
 * Confirmation & the first sale (Commerce Foundation C5 — ADR-007 §5, AMENDMENT-001)
 * over real HTTP + embedded PG. On stage: placed → confirmed with the SINGLE full
 * capture (Option A), the funds landing in merchant_holding (hold.opened), the
 * commit-race resolving pre-capture into honest fallen lines (A7-5 — partial
 * capture of exactly what survived), timeline honesty, and the merchant's
 * promises-in-progress read behind the masked gate.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const inTx = <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
  container.deps.uow.withTransaction(fn as never) as Promise<T>

async function merchant() {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `c5-${uuidv7()}@example.com`, password: 'a long passphrase' } })
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
  const pub = await http.request('GET', `/api/v1/public/stores/${m.handle}/products/${res.body.product_id}`)
  return { productId: res.body.product_id as string, variantId: pub.body.product.variants[0].id as string }
}

function visitorCookie(headers: Headers): string {
  const set = headers.get('set-cookie') ?? ''
  return `dof_visitor=${/dof_visitor=([^;]+)/.exec(set)![1]}`
}

const CONTACT = { name: 'Jonas', email: 'jonas@example.com' }
const DELIVERY = { line1: 'Kerkstraat 1', city: 'Antwerp', postal_code: '2000', country: 'BE' }

async function buy(variantIds: Array<{ id: string; qty: number }>) {
  let cookie: string | null = null
  let cartId = ''
  for (const v of variantIds) {
    const add = await http.request('POST', '/api/v1/public/cart/lines', {
      headers: cookie ? { cookie } : {}, body: { variant_id: v.id, quantity: v.qty } })
    cookie = cookie ?? visitorCookie(add.headers)
    cartId = add.body.cart_id
  }
  const co = await http.request('POST', '/api/v1/public/checkout', {
    headers: { cookie: cookie! }, body: { attempt_key: uuidv7(), cart_id: cartId, contact: CONTACT, delivery: DELIVERY },
  })
  return { cookie: cookie!, response: co }
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('placed → confirmed (the C5 ceremony)', () => {
  it('the single full capture: confirmed, committed, held — and every fact recorded', async () => {
    const m = await merchant()
    const { variantId } = await shelvedVariant(m)
    const { cookie, response } = await buy([{ id: variantId, qty: 2 }])
    expect(response.body.ok).toBe(true)

    // confirmation ran inline after placement
    const order = await http.request('GET', `/api/v1/public/orders/${response.body.order_id}`, { headers: { cookie } })
    expect(order.body.order.state).toBe('confirmed')
    expect(order.body.lines[0].line_state).toBe('committed')
    expect(order.body.timeline.map((t: { entry_type: string }) => t.entry_type)).toEqual(['placed', 'confirmed', 'payment'])

    // the money story: captured intent, funds in the merchant's holding, hold.opened
    const { rows: intents } = await container.pool.query(`SELECT state, captured_minor::int AS captured FROM payment_intents`)
    expect(intents[0].state).toBe('captured')
    expect(intents[0].captured).toBe(9000)
    const { rows: holding } = await container.pool.query(
      `SELECT balance_minor::int AS b FROM ledger_accounts WHERE kind = 'merchant_holding' AND business_id = $1`, [m.businessId])
    expect(holding[0].b).toBe(9000)
    const { rows: events } = await container.pool.query(
      `SELECT event_type FROM payments_domain_events WHERE event_type IN ('payments.charge.succeeded','payments.hold.opened') ORDER BY event_type`)
    expect(events.map((e) => e.event_type)).toEqual(['payments.charge.succeeded', 'payments.hold.opened'])
    const { rows: confirmedEvt } = await container.pool.query(
      `SELECT count(*)::int AS n FROM orders_domain_events WHERE event_type = 'orders.order.confirmed'`)
    expect(confirmedEvt[0].n).toBe(1)

    // idempotent: confirming again changes nothing
    const again = await inTx((tx) => container.orders.confirm.confirmOrder(tx as never, response.body.order_id))
    expect(again && again.ok && again.state).toBe('confirmed')
  })

  it('the race, honestly: an expired claim falls pre-capture — partial capture of what survived', async () => {
    const m = await merchant()
    const a = await shelvedVariant(m, 'Blanket', 4500)
    const b = await shelvedVariant(m, 'Scarf', 2200)
    const { cookie, response } = await buy([{ id: a.variantId, qty: 1 }, { id: b.variantId, qty: 1 }])
    expect(response.body.ok).toBe(true)
    const orderId = response.body.order_id as string
    // the inline confirm already ran; rewind to stage the race: un-confirm cleanly
    // by building a fresh placed order is complex — instead stage BEFORE confirm:
    // (this test drives the service directly on a hand-staged placed order)
    await container.pool.query(`DELETE FROM order_timeline WHERE order_id = $1 AND entry_type <> 'placed'`, [orderId])
    await container.pool.query(`UPDATE orders SET state = 'placed', total_minor = 6700 WHERE id = $1`, [orderId])
    await container.pool.query(`UPDATE order_lines SET line_state = 'reserved' WHERE order_id = $1`, [orderId])
    await container.pool.query(`UPDATE payment_intents SET state = 'authorized', captured_minor = 0`)
    await container.pool.query(`DELETE FROM ledger_entries`)
    await container.pool.query(`UPDATE ledger_accounts SET balance_minor = 0`)
    // the scarf's claim expires (the last unit went elsewhere)
    await container.pool.query(
      `UPDATE reservations SET status = 'expired' WHERE id = (SELECT reservation_id FROM order_lines WHERE order_id = $1 AND line_no = 2)`, [orderId])

    const result = await inTx((tx) => container.orders.confirm.confirmOrder(tx as never, orderId))
    expect(result && result.ok && result.state).toBe('confirmed')
    if (result && result.ok && result.state === 'confirmed') expect(result.fallenLines).toBe(1)

    const order = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(order.body.order.total_minor).toBe(4500) // only the blanket was charged
    const lineStates = Object.fromEntries(order.body.lines.map((l: { line_no: number; line_state: string }) => [l.line_no, l.line_state]))
    expect(lineStates[1]).toBe('committed')
    expect(lineStates[2]).toBe('cancelled')
    const notes = order.body.timeline.filter((t: { entry_type: string }) => t.entry_type === 'note')
    expect(JSON.stringify(notes)).toMatch(/sold out before confirmation/)
    const { rows: intents } = await container.pool.query(`SELECT captured_minor::int AS captured FROM payment_intents`)
    expect(intents[0].captured).toBe(4500) // the one partial capture Stripe permits
  })

  it('everything falls → cancelled, nothing captured, the honest sentence on the timeline', async () => {
    const m = await merchant()
    const { variantId } = await shelvedVariant(m)
    const { cookie, response } = await buy([{ id: variantId, qty: 1 }])
    const orderId = response.body.order_id as string
    await container.pool.query(`DELETE FROM order_timeline WHERE order_id = $1 AND entry_type <> 'placed'`, [orderId])
    await container.pool.query(`UPDATE orders SET state = 'placed' WHERE id = $1`, [orderId])
    await container.pool.query(`UPDATE order_lines SET line_state = 'reserved' WHERE order_id = $1`, [orderId])
    await container.pool.query(`UPDATE payment_intents SET state = 'authorized', captured_minor = 0`)
    await container.pool.query(`DELETE FROM ledger_entries`)
    await container.pool.query(`UPDATE ledger_accounts SET balance_minor = 0`)
    await container.pool.query(`UPDATE reservations SET status = 'expired'`)

    const result = await inTx((tx) => container.orders.confirm.confirmOrder(tx as never, orderId))
    expect(result && result.ok && result.state).toBe('cancelled')
    const order = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(order.body.order.state).toBe('cancelled')
    expect(JSON.stringify(order.body.timeline)).toMatch(/nothing was charged/)
    const { rows } = await container.pool.query(`SELECT captured_minor::int AS c FROM payment_intents`)
    expect(rows[0].c).toBe(0)
  })

  it('PRR-C1: 12 concurrent checkouts by 12 DISTINCT buyers — no pool deadlock, twelve orders', async () => {
    const m = await merchant()
    const { variantId } = await shelvedVariant(m)
    const buyers = await Promise.all(Array.from({ length: 12 }, async () => {
      const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: variantId, quantity: 1 } })
      return { cookie: visitorCookie(add.headers), cartId: add.body.cart_id as string }
    }))
    const results = await Promise.all(buyers.map((b) =>
      http.request('POST', '/api/v1/public/checkout', {
        headers: { cookie: b.cookie },
        body: { attempt_key: uuidv7(), cart_id: b.cartId, contact: CONTACT, delivery: DELIVERY },
      })))
    expect(results.every((r) => r.status === 200 && r.body.ok)).toBe(true)
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM orders WHERE state = 'confirmed'`)
    expect(rows[0].n).toBe(12)
  }, 30_000)

  it('PRR-H1: payment_pending caps at 24h — payment_failed, honest timeline, loud alarm', async () => {
    const m = await merchant()
    const { variantId } = await shelvedVariant(m)
    const { cookie, response } = await buy([{ id: variantId, qty: 1 }])
    const orderId = response.body.order_id as string
    // stage a day-old stuck payment
    await container.pool.query(
      `UPDATE orders SET state = 'payment_pending', placed_at = now() - interval '25 hours' WHERE id = $1`, [orderId])

    await inTx((tx) => container.orders.confirm.sweepUnconfirmed(tx as never))

    const order = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(order.body.order.state).toBe('payment_failed')
    expect(order.body.lines.every((l: { line_state: string }) => l.line_state === 'cancelled')).toBe(true)
    expect(JSON.stringify(order.body.timeline)).toMatch(/nothing more will be charged/)
    // idempotent: sweeping again changes nothing
    await inTx((tx) => container.orders.confirm.sweepUnconfirmed(tx as never))
    const again = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(again.body.order.state).toBe('payment_failed')
  })

  it('PRR-M1: the retention promises are kept — old terminal carts and attempts purge', async () => {
    const m = await merchant()
    const { variantId } = await shelvedVariant(m)
    await buy([{ id: variantId, qty: 1 }]) // leaves a merged cart + a placed attempt
    await container.pool.query(`UPDATE carts SET updated_at = now() - interval '91 days'`)
    await container.pool.query(`UPDATE checkout_attempts SET updated_at = now() - interval '31 days'`)

    const cartsPurged = await inTx((tx) => container.orders.carts.purgeTerminal(tx as never))
    const attemptsPurged = await inTx((tx) => container.orders.checkout.purgeTerminalAttempts(tx as never))
    expect(cartsPurged).toBeGreaterThan(0)
    expect(attemptsPurged).toBeGreaterThan(0)
    expect((await container.pool.query(`SELECT count(*)::int AS n FROM carts`)).rows[0].n).toBe(0)
    expect((await container.pool.query(`SELECT count(*)::int AS n FROM checkout_attempts`)).rows[0].n).toBe(0)
    // the immutable order record is untouched by purges (O1 — the promise record is permanent)
    expect((await container.pool.query(`SELECT count(*)::int AS n FROM orders`)).rows[0].n).toBe(1)
  })

  it('the merchant sees promises in progress; strangers see the masked nothing', async () => {
    const m = await merchant()
    const { variantId } = await shelvedVariant(m)
    await buy([{ id: variantId, qty: 1 }])

    const list = await http.request('GET', `/api/v1/orders?business_id=${m.businessId}`, { headers: { cookie: m.cookie } })
    expect(list.status).toBe(200)
    expect(list.body.items).toHaveLength(1)
    expect(list.body.items[0].state).toBe('confirmed')
    expect(list.body.items[0].buyer_name).toBe('Jonas')
    expect(list.body.items[0].items[0].title).toBe('Lavender blanket')
    // ORR-C1: the fulfiller sees where to ship and how to reach the buyer
    expect(list.body.items[0].delivery.line1).toBe('Kerkstraat 1')
    expect(list.body.items[0].delivery.city).toBe('Antwerp')
    expect(list.body.items[0].buyer_email).toBe('jonas@example.com')

    const stranger = await merchant()
    const masked = await http.request('GET', `/api/v1/orders?business_id=${m.businessId}`, { headers: { cookie: stranger.cookie } })
    expect(masked.status).toBe(404)
  })
})
