/**
 * Fulfillment & Shipping (Commerce Foundation C6) over real HTTP + embedded PG.
 * The campaign's hostile scenarios on stage: (1) merchant never ships → the
 * three-stage aging path ends in the automatic refund with ledger reversal;
 * (2) shipped-mark alone never releases the hold — the quiet week does;
 * (3) split shipment over multiple dates via case splitting; (9) a cron dead
 * for days resumes and converges; (12) dispatch after the automatic refund
 * moves no money and corrupts no state. Plus: shipping profile pricing,
 * pickup handover, digital instant grant.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { holdReleaseDue } from '@domains/payments/application/hold-policy'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const inTx = <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
  container.deps.uow.withTransaction(fn as never) as Promise<T>

// §7: the sweep journals stage-3 refunds; driving the boundary afterwards is
// exactly what the cron does — tests mirror production's two-phase shape
const sweepAging = async () => {
  const swept = await inTx((tx) => container.orders.confirm.sweepAging(tx as never, {
    listCases: (t, orderId) => container.operations.fulfillment.listByOrder(t as never, orderId),
    prepareRefund: (t, input) => container.payments.service.prepareRefund(t as never, input),
  }))
  for (const opId of swept.refundOps) await container.payments.boundary.drive(opId)
  return swept
}
const sweepHold = () => inTx((tx) => container.orders.confirm.sweepHoldRelease(tx as never, {
  listCases: (t, orderId) => container.operations.fulfillment.listByOrder(t as never, orderId),
  releaseHold: (t, input) => container.payments.service.releaseHold(t as never, input),
  policy: holdReleaseDue,
}))

async function merchant() {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `c6-${uuidv7()}@example.com`, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle } })
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
  return { cookie, businessId: biz.body.business_id, storeId: store.body.store_id, handle }
}

async function shelvedVariant(m: Awaited<ReturnType<typeof merchant>>, title = 'Lavender blanket', priceMinor = 4500, kind: 'physical' | 'digital' = 'physical') {
  const res = await http.request('POST', '/api/v1/products', {
    headers: { cookie: m.cookie },
    body: { business_id: m.businessId, title, fulfillment_kind: kind, default_price: { amount: priceMinor, currency: 'EUR' }, publish_to_store_id: m.storeId },
  })
  const pub = await http.request('GET', `/api/v1/public/stores/${m.handle}/products/${res.body.product_id}`)
  return { productId: res.body.product_id as string, variantId: pub.body.product.variants[0].id as string }
}

function visitorCookie(headers: Headers): string {
  return `dof_visitor=${/dof_visitor=([^;]+)/.exec(headers.get('set-cookie') ?? '')![1]}`
}

const CONTACT = { name: 'Jonas', email: 'jonas@example.com' }
const DELIVERY = { line1: 'Kerkstraat 1', city: 'Antwerp', postal_code: '2000', country: 'BE' }

async function buy(variants: Array<{ id: string; qty: number }>, method?: 'pickup') {
  let cookie: string | null = null
  let cartId = ''
  for (const v of variants) {
    const add = await http.request('POST', '/api/v1/public/cart/lines', { headers: cookie ? { cookie } : {}, body: { variant_id: v.id, quantity: v.qty } })
    cookie = cookie ?? visitorCookie(add.headers)
    cartId = add.body.cart_id
  }
  const co = await http.request('POST', '/api/v1/public/checkout', {
    headers: { cookie: cookie! },
    body: { attempt_key: uuidv7(), cart_id: cartId, contact: CONTACT, delivery: DELIVERY, ...(method ? { method } : {}) },
  })
  expect(co.body.ok).toBe(true)
  return { cookie: cookie!, orderId: co.body.order_id as string }
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('C6 — fulfillment & shipping', () => {
  it('the promise is born at confirm; pack + full dispatch tell the story; the quiet week releases the hold (scenario 2)', async () => {
    const m = await merchant()
    const { variantId } = await shelvedVariant(m)
    const { cookie, orderId } = await buy([{ id: variantId, qty: 1 }])

    // the promise chapter exists with a real date; one open ship case exists
    const order1 = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(order1.body.order.state).toBe('confirmed')
    const promise = order1.body.timeline.find((t: { entry_type: string }) => t.entry_type === 'promise')
    expect(promise?.message.ship_by).toBeTruthy()

    // pack with a parcel photo, then dispatch with tracking
    const mediaId = uuidv7()
    const packed = await http.request('POST', `/api/v1/orders/${orderId}/pack`, { headers: { cookie: m.cookie }, body: { parcel_media_id: mediaId } })
    expect(packed.status).toBe(200)
    const dispatched = await http.request('POST', `/api/v1/orders/${orderId}/dispatch`, {
      headers: { cookie: m.cookie }, body: { carrier: 'bpost', tracking_ref: 'BE-123' } })
    expect(dispatched.status).toBe(200)

    const order2 = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(order2.body.order.state).toBe('fulfilled')
    const kinds = order2.body.timeline.map((t: { entry_type: string }) => t.entry_type)
    expect(kinds).toContain('packed')
    expect(kinds).toContain('shipped')
    const shippedEntry = order2.body.timeline.find((t: { entry_type: string }) => t.entry_type === 'shipped')
    expect(shippedEntry.message.tracking_ref).toBe('BE-123')

    // scenario 2: the shipped MARK alone releases nothing
    expect(await sweepHold()).toBe(0)
    // …the quiet week does
    await container.pool.query(`UPDATE fulfillment_cases SET dispatched_at = now() - interval '8 days' WHERE order_id = $1`, [orderId])
    expect(await sweepHold()).toBe(1)
    expect(await sweepHold()).toBe(0) // idempotent
    const { rows: payable } = await container.pool.query(
      `SELECT balance_minor::int AS b FROM ledger_accounts WHERE kind = 'merchant_payable' AND business_id = $1`, [m.businessId])
    expect(payable[0].b).toBe(4500)
    const { rows: released } = await container.pool.query(
      `SELECT count(*)::int AS n FROM payments_domain_events WHERE event_type = 'payments.hold.released'`)
    expect(released[0].n).toBe(1)
  })

  it('scenario 3: split shipment over multiple dates — the case splits, the timeline stays honest', async () => {
    const m = await merchant()
    const a = await shelvedVariant(m, 'Blanket', 4500)
    const b = await shelvedVariant(m, 'Scarf', 2200)
    const { cookie, orderId } = await buy([{ id: a.variantId, qty: 1 }, { id: b.variantId, qty: 1 }])

    const first = await http.request('POST', `/api/v1/orders/${orderId}/dispatch`, {
      headers: { cookie: m.cookie }, body: { carrier: 'bpost', tracking_ref: 'BE-1', line_nos: [1] } })
    expect(first.status).toBe(200)
    expect(first.body.remainder_case_id).toBeTruthy()

    const mid = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(mid.body.order.state).toBe('partially_fulfilled')
    const firstShipped = mid.body.timeline.find((t: { entry_type: string }) => t.entry_type === 'shipped')
    expect(firstShipped.message.partial).toBe(true)
    expect(firstShipped.message.titles).toEqual(['Blanket'])

    const second = await http.request('POST', `/api/v1/orders/${orderId}/dispatch`, {
      headers: { cookie: m.cookie }, body: { carrier: 'bpost', tracking_ref: 'BE-2' } })
    expect(second.status).toBe(200)
    const done = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(done.body.order.state).toBe('fulfilled')
    expect(done.body.timeline.filter((t: { entry_type: string }) => t.entry_type === 'shipped')).toHaveLength(2)
  })

  it('scenarios 1 + 9: the merchant never ships — a cron dead for days resumes, walks all three stages, and the keystone refunds automatically', async () => {
    const m = await merchant()
    const { variantId } = await shelvedVariant(m)
    const { cookie, orderId } = await buy([{ id: variantId, qty: 1 }])

    // the cron was dead: the promise passed 11 days ago (past every threshold)
    await container.pool.query(`UPDATE orders SET promise_ship_by = now() - interval '11 days' WHERE id = $1`, [orderId])

    // scenario 9's ideal: ONE resumed tick walks every DUE stage to convergence
    const pass1 = await sweepAging()
    expect(pass1).toMatchObject({ nudged: 1, disclosed: 1, refunded: 1 })
    expect(pass1.refundOps).toHaveLength(1) // §7: the keystone refund was journaled AND driven
    const pass2 = await sweepAging() // idempotent: the ratchet is done
    expect(pass2).toMatchObject({ nudged: 0, disclosed: 0, refunded: 0 })

    const order = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(order.body.order.state).toBe('cancelled')
    expect(order.body.lines[0].line_state).toBe('cancelled')
    const texts = JSON.stringify(order.body.timeline)
    expect(texts).toMatch(/promised ship-by date has passed/)
    expect(texts).toMatch(/money is on its way back automatically/)

    // the money: refunded fact, refunded_minor, ledger back to zero for the merchant
    const { rows: intents } = await container.pool.query(`SELECT refunded_minor::int AS r, captured_minor::int AS c FROM payment_intents`)
    expect(intents[0].r).toBe(intents[0].c)
    const { rows: holding } = await container.pool.query(
      `SELECT balance_minor::int AS b FROM ledger_accounts WHERE kind = 'merchant_holding' AND business_id = $1`, [m.businessId])
    expect(holding[0].b).toBe(0)
    const { rows: refundEvents } = await container.pool.query(
      `SELECT count(*)::int AS n FROM payments_domain_events WHERE event_type = 'payments.refund.issued'`)
    expect(refundEvents[0].n).toBe(1)
    // L3 holds after the reversal
    const check = await inTx((tx) => container.payments.service.ledger.recomputeCheck(tx as never))
    expect(check.clean).toBe(true)

    // scenario 12: a dispatch arriving AFTER the automatic refund moves nothing
    const late = await http.request('POST', `/api/v1/orders/${orderId}/dispatch`, {
      headers: { cookie: m.cookie }, body: { carrier: 'bpost', tracking_ref: 'LATE-1' } })
    expect([200, 409]).toContain(late.status) // the case may still accept the mark…
    const after = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(after.body.order.state).toBe('cancelled') // …but the order does not move
    expect(await sweepHold()).toBe(0)               // and no money ever does
    const { rows: stillZero } = await container.pool.query(
      `SELECT balance_minor::int AS b FROM ledger_accounts WHERE kind = 'merchant_payable' AND business_id = $1`, [m.businessId])
    expect(stillZero[0]?.b ?? 0).toBe(0)
  })

  it('shipping profile prices the quote: flat rate + free-over threshold', async () => {
    const m = await merchant()
    const { variantId } = await shelvedVariant(m, 'Blanket', 4500)
    const put = await http.request('PUT', `/api/v1/stores/${m.storeId}/shipping`, {
      headers: { cookie: m.cookie },
      body: { handling_days: 2, flat_rate_minor: 500, free_over_minor: 8000, pickup_enabled: true } })
    expect(put.status).toBe(200)

    const one = await buy([{ id: variantId, qty: 1 }]) // 4500 < 8000 → flat 500
    const o1 = await http.request('GET', `/api/v1/public/orders/${one.orderId}`, { headers: { cookie: one.cookie } })
    expect(o1.body.order.shipping_minor).toBe(500)
    expect(o1.body.order.total_minor).toBe(5000)

    const two = await buy([{ id: variantId, qty: 2 }]) // 9000 ≥ 8000 → free
    const o2 = await http.request('GET', `/api/v1/public/orders/${two.orderId}`, { headers: { cookie: two.cookie } })
    expect(o2.body.order.shipping_minor).toBe(0)
  })

  it('pickup: ready → collected → the handover releases the hold immediately', async () => {
    const m = await merchant()
    const { variantId } = await shelvedVariant(m)
    await http.request('PUT', `/api/v1/stores/${m.storeId}/shipping`, {
      headers: { cookie: m.cookie }, body: { handling_days: 1, flat_rate_minor: 500, free_over_minor: null, pickup_enabled: true } })
    const { cookie, orderId } = await buy([{ id: variantId, qty: 1 }], 'pickup')

    const o1 = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(o1.body.order.shipping_minor).toBe(0) // pickup ships nothing

    const ready = await http.request('POST', `/api/v1/orders/${orderId}/dispatch`, { headers: { cookie: m.cookie }, body: {} })
    expect(ready.body.ready_for_pickup).toBe(true)
    const collected = await http.request('POST', `/api/v1/orders/${orderId}/collected`, { headers: { cookie: m.cookie }, body: {} })
    expect(collected.status).toBe(200)

    const o2 = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(o2.body.order.state).toBe('fulfilled')
    expect(JSON.stringify(o2.body.timeline)).toMatch(/in your hands/)
    expect(await sweepHold()).toBe(1) // handover satisfies the policy immediately
  })

  it('digital: granted at confirm, no promise chapter, hold releases on grant', async () => {
    const m = await merchant()
    const { variantId } = await shelvedVariant(m, 'Knitting patterns (PDF)', 1200, 'digital')
    const { cookie, orderId } = await buy([{ id: variantId, qty: 1 }])

    const order = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(order.body.order.state).toBe('fulfilled')
    expect(order.body.lines[0].line_state).toBe('fulfilled')
    const kinds = order.body.timeline.map((t: { entry_type: string }) => t.entry_type)
    expect(kinds).toContain('granted')
    expect(kinds).not.toContain('promise')
    expect(await sweepHold()).toBe(1)
  })
})
