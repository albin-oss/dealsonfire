/**
 * Operator surfaces (C9 — Support Operability). The smallest audited toolkit:
 * reconstruction (the runbook, executable), the ops refund (bounded + cause-
 * keyed — a retried retry changes nothing), the note/ack pen (internal notes
 * NEVER reach the buyer page), and the alarms queue derived from state.
 * Non-operators get the masked nothing.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function actor(email: string) {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const me = await http.request('GET', '/api/v1/auth/session', { headers: { cookie } })
  return { cookie, userId: me.body.user_id as string }
}

async function soldOrder() {
  const m = await actor(`ops-m-${uuidv7()}@maker.example`)
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie: m.cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie: m.cookie }, body: { name: 'Rosa Knits', handle } })
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie: m.cookie } })
  const p = await http.request('POST', '/api/v1/products', {
    headers: { cookie: m.cookie },
    body: { business_id: biz.body.business_id, title: 'Blanket', fulfillment_kind: 'physical', default_price: { amount: 4500, currency: 'EUR' }, publish_to_store_id: store.body.store_id },
  })
  const pub = await http.request('GET', `/api/v1/public/stores/${handle}/products/${p.body.product_id}`)
  const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: pub.body.product.variants[0].id, quantity: 1 } })
  const buyerCookie = `dof_visitor=${/dof_visitor=([^;]+)/.exec(add.headers.get('set-cookie') ?? '')![1]}`
  const co = await http.request('POST', '/api/v1/public/checkout', {
    headers: { cookie: buyerCookie },
    body: { attempt_key: uuidv7(), cart_id: add.body.cart_id, contact: { name: 'Jonas', email: 'jonas@buyer.example' }, delivery: { line1: 'K 1', city: 'A', postal_code: '2000', country: 'BE' } },
  })
  expect(co.body.ok).toBe(true)
  return { orderId: co.body.order_id as string, buyerCookie, merchant: m }
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown(); delete process.env.NUXT_OPS_USER_IDS })
beforeEach(async () => {
  await truncateAll(container.pool)
  ;(container.rateLimiter as { reset?: () => void }).reset?.()
})

describe('C9 — operator surfaces', () => {
  it('the gate is the list; reconstruction tells the WHOLE story; the ops refund is bounded and idempotent; internal notes stay internal', async () => {
    const ops = await actor(`ops-${uuidv7()}@dof.example`)
    const outsider = await actor(`out-${uuidv7()}@dof.example`)
    process.env.NUXT_OPS_USER_IDS = ` ${ops.userId} , ${uuidv7()}`
    const { orderId, buyerCookie } = await soldOrder()

    // the gate: not on the list → the masked nothing
    const denied = await http.request('GET', `/api/v1/ops/orders/${orderId}`, { headers: { cookie: outsider.cookie } })
    expect(denied.status).toBe(404)

    // reconstruction: order + lines + timeline + money + events, one response
    const recon = await http.request('GET', `/api/v1/ops/orders/${orderId}`, { headers: { cookie: ops.cookie } })
    expect(recon.status).toBe(200)
    expect(recon.body.order.id).toBe(orderId)
    expect(recon.body.lines).toHaveLength(1)
    expect(recon.body.payment.intent.state).toBe('captured')
    expect(recon.body.payment.facts.map((f: { kind: string }) => f.kind)).toEqual(expect.arrayContaining(['authorized', 'captured']))
    expect(recon.body.payment.ledger.length).toBeGreaterThan(0)
    expect(recon.body.events.map((e: { event_type: string }) => e.event_type)).toContain('orders.order.confirmed')

    // the ops refund: cause-keyed → the retried retry changes NOTHING
    const key = 'goodwill-1'
    const r1 = await http.request('POST', `/api/v1/ops/orders/${orderId}/refund`, {
      headers: { cookie: ops.cookie }, body: { amount_minor: 500, cause_key: key, reason: 'parcel arrived scuffed — goodwill' } })
    expect(r1.body.refunded_minor).toBe(500)
    await http.request('POST', `/api/v1/ops/orders/${orderId}/refund`, {
      headers: { cookie: ops.cookie }, body: { amount_minor: 500, cause_key: key, reason: 'retry after timeout' } })
    const { rows } = await container.pool.query(`SELECT refunded_minor::int AS r FROM payment_intents`)
    expect(rows[0].r).toBe(500) // once
    // bounded: the schema says no (refunded ≤ captured) — overdraw is impossible
    const over = await http.request('POST', `/api/v1/ops/orders/${orderId}/refund`, {
      headers: { cookie: ops.cookie }, body: { amount_minor: 99900, cause_key: 'overdraw', reason: 'fat fingers' } })
    expect(over.status).toBe(409)

    // the note/ack pen: internal by default, and the buyer page NEVER shows it
    await http.request('POST', `/api/v1/ops/orders/${orderId}/note`, {
      headers: { cookie: ops.cookie }, body: { text: 'Called the carrier; parcel located.', ack: true } })
    const buyerView = await http.request('GET', `/api/v1/public/orders/${orderId}`, { headers: { cookie: buyerCookie } })
    expect(JSON.stringify(buyerView.body.timeline)).not.toMatch(/carrier/)
    const recon2 = await http.request('GET', `/api/v1/ops/orders/${orderId}`, { headers: { cookie: ops.cookie } })
    expect(JSON.stringify(recon2.body.timeline)).toMatch(/carrier/) // support still sees it

    // every ops command is audited with the operator as actor
    const { rows: audit } = await container.pool.query(
      `SELECT count(*)::int AS n FROM audit_logs WHERE command IN ('ops.order.refund','ops.order.note')`)
    expect(audit[0].n).toBeGreaterThanOrEqual(2)
  })

  it('alarms are derived from state and carry the human ack', async () => {
    const ops = await actor(`ops-${uuidv7()}@dof.example`)
    process.env.NUXT_OPS_USER_IDS = ops.userId
    const { orderId } = await soldOrder()
    // stage a stuck payment_pending (2h+) — the state IS the alarm
    await container.pool.query(`UPDATE orders SET state = 'payment_pending', placed_at = now() - interval '3 hours' WHERE id = $1`, [orderId])
    const before = await http.request('GET', '/api/v1/ops/alarms', { headers: { cookie: ops.cookie } })
    const alarm = before.body.alarms.find((a: { id: string }) => a.id === orderId)
    expect(alarm?.kind).toBe('payment_stuck')
    expect(alarm?.acknowledged).toBe(false)

    await http.request('POST', `/api/v1/ops/orders/${orderId}/note`, {
      headers: { cookie: ops.cookie }, body: { text: 'Seen — buyer bank is slow; watching.', ack: true } })
    const after = await http.request('GET', '/api/v1/ops/alarms', { headers: { cookie: ops.cookie } })
    expect(after.body.alarms.find((a: { id: string }) => a.id === orderId)?.acknowledged).toBe(true)
  })
})
