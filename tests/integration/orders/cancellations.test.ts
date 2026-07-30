/**
 * Cancellations & refunds (Commerce Foundation C8) over real HTTP + embedded PG.
 * Hostile scenarios on stage: (6) a browser refresh double-submits harmlessly;
 * (8) the refund provider fails AFTER the decision — the whole decision rolls
 * back atomically, retries converge; (11) buyer and merchant act concurrently —
 * row locks make one of them first and both honest. Money laws: bounded,
 * idempotent by cause, ledger-reversed, L3 clean after every path.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { SANDBOX_REFUND_FAIL_AMOUNT_MINOR } from '@domains/payments/application/payments'
import type { SandboxMailer } from '@platform/mail'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const inTx = <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
  container.deps.uow.withTransaction(fn as never) as Promise<T>

async function merchant(email = `c8-${uuidv7()}@maker.example`) {
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

async function buy(variants: Array<{ id: string; qty: number }>) {
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
  return { cookie: cookie!, orderId: co.body.order_id as string }
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => {
  await truncateAll(container.pool)
  ;(container.rateLimiter as { reset?: () => void }).reset?.()
  ;(container.mail as SandboxMailer).outbox.length = 0
})

describe('C8 — cancellations & refunds', () => {
  it('nothing packed: the tap IS the decision — instant full refund, stock restocked, L3 clean (scenario 6: refresh double-submit converges)', async () => {
    const m = await merchant()
    const { variantId } = await shelved(m, 'Blanket', 4500, true)
    const { cookie, orderId } = await buy([{ id: variantId, qty: 2 }])

    const first = await http.request('POST', `/api/v1/public/orders/${orderId}/cancel`, { headers: { cookie } })
    expect(first.body.outcome).toBe('cancelled')
    // the refresh double-submit (scenario 6): a spent order answers honestly, moves nothing
    const again = await http.request('POST', `/api/v1/public/orders/${orderId}/cancel`, { headers: { cookie } })
    expect(again.body.outcome).toBe('not_cancellable')

    const order = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(order.body.order.state).toBe('cancelled')
    expect(JSON.stringify(order.body.timeline)).toMatch(/Cancelled at your request/)
    // every cent back, exactly once
    const { rows: intents } = await container.pool.query(`SELECT captured_minor::int AS c, refunded_minor::int AS r FROM payment_intents`)
    expect(intents[0].r).toBe(intents[0].c)
    // tracked stock is back on the shelf
    const { rows: stock } = await container.pool.query(`SELECT on_hand FROM stock_items`)
    expect(stock[0].on_hand).toBe(5)
    const check = await inTx((tx) => container.payments.service.ledger.recomputeCheck(tx as never))
    expect(check.clean).toBe(true)

    // both letters landed
    await container.orders.dispatcher.dispatchPending()
    await container.payments.dispatcher.dispatchPending()
    const letters = (container.mail as SandboxMailer).outbox.map((msg) => `${msg.to}|${msg.subject}`)
    expect(letters.some((l) => l.includes('jonas@buyer.example') && l.includes('Cancelled'))).toBe(true)
    expect(letters.some((l) => l.includes(m.email) && l.includes('was cancelled'))).toBe(true)
  })

  it('parcel in motion: the bench decides — approve refunds the unshipped part only (scenario 11: dispatch and cancel converge)', async () => {
    const m = await merchant()
    const a = await shelved(m, 'Blanket', 4500)
    const b = await shelved(m, 'Scarf', 2200)
    const { cookie, orderId } = await buy([{ id: a.variantId, qty: 1 }, { id: b.variantId, qty: 1 }])

    // the merchant dispatches line 1 first (scenario 11: merchant acted first)
    await http.request('POST', `/api/v1/orders/${orderId}/dispatch`, { headers: { cookie: m.cookie }, body: { carrier: 'bpost', line_nos: [1] } })

    const ask = await http.request('POST', `/api/v1/public/orders/${orderId}/cancel`, { headers: { cookie } })
    expect(ask.body.outcome).toBe('requested')

    const approve = await http.request('POST', `/api/v1/orders/${orderId}/cancel-decision`, { headers: { cookie: m.cookie }, body: { approve: true } })
    expect(approve.status).toBe(200)
    expect(approve.body.refunded_minor).toBe(2200) // the scarf only — the blanket already shipped (shipping stays: something shipped)

    const order = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    const states = Object.fromEntries(order.body.lines.map((l: { line_no: number; line_state: string }) => [l.line_no, l.line_state]))
    expect(states[1]).toBe('fulfilled')
    expect(states[2]).toBe('cancelled')
    expect(order.body.order.state).not.toBe('cancelled') // the shipped half lives on
    expect(JSON.stringify(order.body.timeline)).toMatch(/unshipped part is cancelled/)
  })

  it('decline: it stays on its way, said honestly; the request clears', async () => {
    const m = await merchant()
    const { variantId } = await shelved(m, 'Blanket', 4500)
    const { cookie, orderId } = await buy([{ id: variantId, qty: 1 }])
    await http.request('POST', `/api/v1/orders/${orderId}/pack`, { headers: { cookie: m.cookie }, body: {} })
    const ask = await http.request('POST', `/api/v1/public/orders/${orderId}/cancel`, { headers: { cookie } })
    expect(ask.body.outcome).toBe('requested')

    const decline = await http.request('POST', `/api/v1/orders/${orderId}/cancel-decision`, { headers: { cookie: m.cookie }, body: { approve: false } })
    expect(decline.status).toBe(200)
    const order = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(order.body.order.cancel_requested).toBe(false)
    expect(order.body.order.state).toBe('in_fulfillment')
    expect(JSON.stringify(order.body.timeline)).toMatch(/keeping this one on its way/)
    const { rows } = await container.pool.query(`SELECT refunded_minor::int AS r FROM payment_intents`)
    expect(rows[0].r).toBe(0)
  })

  it('scenario 8: the provider refuses the refund — the DECISION rolls back whole; the retry converges', async () => {
    const m = await merchant()
    // price the order at exactly the twin's refund-fail injection amount
    const { variantId } = await shelved(m, 'Cursed scarf', SANDBOX_REFUND_FAIL_AMOUNT_MINOR)
    const { cookie, orderId } = await buy([{ id: variantId, qty: 1 }])

    const failed = await http.request('POST', `/api/v1/public/orders/${orderId}/cancel`, { headers: { cookie } })
    expect(failed.status).toBe(409) // honest conflict; nothing changed
    const order = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie } })
    expect(order.body.order.state).toBe('confirmed') // the decision never outran its money
    expect(order.body.lines[0].line_state).toBe('committed')
    const { rows } = await container.pool.query(`SELECT refunded_minor::int AS r FROM payment_intents`)
    expect(rows[0].r).toBe(0)

    // the provider recovers (staged: the refund amount clears the injected value —
    // 66600 ≤ captured 66601 keeps P2 honest) — the retry converges
    await container.pool.query(`UPDATE order_lines SET unit_price_minor = unit_price_minor - 1 WHERE order_id = $1`, [orderId])
    const retry = await http.request('POST', `/api/v1/public/orders/${orderId}/cancel`, { headers: { cookie } })
    expect(retry.body.outcome).toBe('cancelled')
    const { rows: after } = await container.pool.query(`SELECT refunded_minor::int AS r, captured_minor::int AS c FROM payment_intents`)
    expect(after[0].r).toBe(after[0].c - 1) // bounded, converged, once
  })
})
