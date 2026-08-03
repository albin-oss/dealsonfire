/**
 * The provider boundary (C10 Slice 1 — UPDATED_PAYMENT_LIFECYCLE §7) under
 * hostile conditions: G2's tripwire (a provider call inside an open transaction
 * THROWS), racing drivers settle exactly once, and a crash between phase 2 and
 * phase 3 converges via the recovery sweep instead of drifting.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { insideTransaction } from '@platform/db'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const inTx = <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
  container.deps.uow.withTransaction(fn as never) as Promise<T>

async function soldOrder() {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `b-${uuidv7()}@maker.example`, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle } })
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
  const p = await http.request('POST', '/api/v1/products', {
    headers: { cookie },
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
  return { orderId: co.body.order_id as string }
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('§7 — the provider boundary', () => {
  it('G2: the tripwire is armed — driving the boundary inside an open transaction THROWS', async () => {
    expect(insideTransaction()).toBe(false)
    await inTx(async () => { expect(insideTransaction()).toBe(true) })
    await expect(inTx(() => container.payments.boundary.drive(uuidv7())))
      .rejects.toThrow(/boundary violation \(G2\)/)
    await expect(inTx(() => container.payments.boundary.driveAll()))
      .rejects.toThrow(/boundary violation \(G2\)/)
  })

  it('hostile 20 (concurrent confirmations): racing drivers settle ONE op exactly once', async () => {
    const { orderId } = await soldOrder()
    // stage a fresh journaled refund
    const opId = await inTx(async (tx) => {
      const prepared = await container.payments.service.prepareRefund(tx as never, {
        orderId, amountMinor: 500, causeKey: 'race-test', cause: { kind: 'test' } })
      if (!prepared.ok) throw new Error(prepared.detail)
      return prepared.opId!
    })
    const results = await Promise.all(Array.from({ length: 6 }, () => container.payments.boundary.drive(opId)))
    expect(results.filter((r) => r.settled)).toHaveLength(1) // exactly one settle
    const { rows } = await container.pool.query(`SELECT refunded_minor::int AS r FROM payment_intents WHERE order_id = $1`, [orderId])
    expect(rows[0].r).toBe(500) // money moved once
  })

  it('hostile 8 (process death between phase 2 and phase 3): the recovery sweep converges, money once', async () => {
    const { orderId } = await soldOrder()
    const opId = await inTx(async (tx) => {
      const prepared = await container.payments.service.prepareRefund(tx as never, {
        orderId, amountMinor: 700, causeKey: 'crash-test', cause: { kind: 'test' } })
      if (!prepared.ok) throw new Error(prepared.detail)
      return prepared.opId!
    })
    // simulate: phase 2 already reached the provider (sandbox is stateless-ok, like a
    // Stripe retry under the same idempotency key), phase 3 never ran — the row sits
    // pending past the grace window
    await container.pool.query(`UPDATE provider_operations SET updated_at = now() - interval '5 minutes', attempts = 1 WHERE id = $1`, [opId])
    const swept = await container.payments.boundary.driveAll()
    expect(swept.settled).toBe(1)
    // idempotent re-sweep: nothing more moves
    await container.pool.query(`UPDATE provider_operations SET updated_at = now() - interval '5 minutes' WHERE id = $1`, [opId])
    const again = await container.payments.boundary.driveAll()
    expect(again.settled).toBe(0)
    const { rows } = await container.pool.query(`SELECT refunded_minor::int AS r FROM payment_intents WHERE order_id = $1`, [orderId])
    expect(rows[0].r).toBe(700)
    const check = await inTx((tx) => container.payments.service.ledger.recomputeCheck(tx as never))
    expect(check.clean).toBe(true)
  })

  it('expired-order abandonment: the 24h path closes pending ops so the driver never resurrects them', async () => {
    const { orderId } = await soldOrder()
    await container.pool.query(`UPDATE orders SET state = 'payment_pending', placed_at = now() - interval '25 hours' WHERE id = $1`, [orderId])
    await container.pool.query(
      `UPDATE payment_intents SET state = 'authorized', captured_minor = 0
        WHERE attempt_key = (SELECT attempt_key FROM orders WHERE id = $1)`, [orderId])
    await container.pool.query(`DELETE FROM provider_operations`) // restage: pre-capture world
    // a stranded capture op from a crashed confirm
    await inTx(async (tx) => {
      await container.orders.confirm.confirmOrder(tx as never, orderId) // journals the capture, order → payment_pending
    })
    await container.pool.query(`UPDATE orders SET state = 'payment_pending', placed_at = now() - interval '25 hours' WHERE id = $1`, [orderId])
    const swept = await inTx((tx) => container.orders.confirm.sweepUnconfirmed(tx as never))
    expect(swept.voidRefs).toHaveLength(1)
    const { rows: ops } = await container.pool.query(
      `SELECT kind, state FROM provider_operations WHERE kind = 'capture'`)
    expect(ops[0]?.state).toBe('abandoned')
    // driving all leaves the abandoned op untouched
    await container.pool.query(`UPDATE provider_operations SET updated_at = now() - interval '5 minutes'`)
    await container.payments.boundary.driveAll()
    const { rows: after } = await container.pool.query(`SELECT state FROM provider_operations WHERE kind = 'capture'`)
    expect(after[0].state).toBe('abandoned')
  })
})
