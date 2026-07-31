/**
 * The notification seam (Commerce Foundation C7) over real HTTP + embedded PG.
 * Letters are outbox consumers: the delivery ledger makes replay-dedupe a law,
 * not an effort (hostile scenario 4-adjacent: dispatch replays send nothing
 * twice). Every letter answers: what happened, what happens next, what you can
 * do — and no system words leak (the copy laws, greppable).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import type { SandboxMailer } from '@platform/mail'
import { holdReleaseDue } from '@domains/payments/application/hold-policy'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const mailbox = () => (container.mail as SandboxMailer).outbox
const drain = async () => {
  await container.orders.dispatcher.dispatchPending()
  await container.payments.dispatcher.dispatchPending()
}
const inTx = <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
  container.deps.uow.withTransaction(fn as never) as Promise<T>

async function merchant(email: string) {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle } })
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
  const res = await http.request('POST', '/api/v1/products', {
    headers: { cookie },
    body: { business_id: biz.body.business_id, title: 'Blanket', fulfillment_kind: 'physical', default_price: { amount: 4500, currency: 'EUR' }, publish_to_store_id: store.body.store_id },
  })
  const pub = await http.request('GET', `/api/v1/public/stores/${handle}/products/${res.body.product_id}`)
  return { cookie, businessId: biz.body.business_id, variantId: pub.body.product.variants[0].id as string }
}

async function buy(variantId: string) {
  const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: variantId, quantity: 1 } })
  const cookie = `dof_visitor=${/dof_visitor=([^;]+)/.exec(add.headers.get('set-cookie') ?? '')![1]}`
  const co = await http.request('POST', '/api/v1/public/checkout', {
    headers: { cookie },
    body: { attempt_key: uuidv7(), cart_id: add.body.cart_id, contact: { name: 'Jonas', email: 'jonas@buyer.example' }, delivery: { line1: 'K 1', city: 'A', postal_code: '2000', country: 'BE' } },
  })
  expect(co.body.ok).toBe(true)
  return co.body.order_id as string
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => {
  await truncateAll(container.pool)
  ;(container.rateLimiter as { reset?: () => void }).reset?.()
  mailbox().length = 0
})

describe('C7 — the letters', () => {
  it('confirmation letters both ways; replays send NOTHING twice', async () => {
    const ownerEmail = `rosa-${uuidv7().slice(-6)}@maker.example`
    const m = await merchant(ownerEmail)
    await buy(m.variantId)

    await drain()
    const first = mailbox().map((msg) => `${msg.to}|${msg.subject}`)
    expect(first.some((l) => l.startsWith('jonas@buyer.example|') && l.includes('has your order'))).toBe(true)
    expect(first.some((l) => l.startsWith(ownerEmail) && l.includes('Someone just bought'))).toBe(true)
    // the buyer letter answers all three questions and holds the copy laws
    const buyerLetter = mailbox().find((msg) => msg.to === 'jonas@buyer.example')!
    expect(buyerLetter.body).toMatch(/What happens next/)
    expect(buyerLetter.body).toMatch(/\/o\//)
    expect(buyerLetter.body).not.toMatch(/status|process|system|transaction/i)

    // replay: dispatch again — the delivery ledger blocks every duplicate
    const count = mailbox().length
    await drain()
    expect(mailbox().length).toBe(count)
  })

  it('the honest stumble by mail: promise missed → both letters; auto-refund → the protection letters', async () => {
    const ownerEmail = `rosa-${uuidv7().slice(-6)}@maker.example`
    const m = await merchant(ownerEmail)
    const orderId = await buy(m.variantId)
    await drain()
    mailbox().length = 0

    await container.pool.query(`UPDATE orders SET promise_ship_by = now() - interval '11 days' WHERE id = $1`, [orderId])
    const swept = await inTx((tx) => container.orders.confirm.sweepAging(tx as never, {
      listCases: (t, oid) => container.operations.fulfillment.listByOrder(t as never, oid),
      prepareRefund: (t, input) => container.payments.service.prepareRefund(t as never, input),
    }))
    for (const opId of swept.refundOps) await container.payments.boundary.drive(opId)
    await drain()

    const letters = mailbox().map((msg) => `${msg.to}|${msg.subject}`)
    expect(letters.some((l) => l.includes('jonas@buyer.example') && l.includes('About your order'))).toBe(true)
    expect(letters.some((l) => l.startsWith(ownerEmail) && l.includes('Did this ship?'))).toBe(true)
    expect(letters.some((l) => l.includes('jonas@buyer.example') && l.includes('on its way back'))).toBe(true)
    expect(letters.some((l) => l.startsWith(ownerEmail) && l.includes('refunded automatically'))).toBe(true)
    // the refund fact letter (payments side) also landed exactly once
    expect(letters.filter((l) => l.includes('on its way back to you')).length).toBe(1)
  })

  it('the payout letter: the quiet week passes → the merchant hears the money moved', async () => {
    const ownerEmail = `rosa-${uuidv7().slice(-6)}@maker.example`
    const m = await merchant(ownerEmail)
    const orderId = await buy(m.variantId)
    await http.request('POST', `/api/v1/orders/${orderId}/dispatch`, { headers: { cookie: m.cookie }, body: { carrier: 'bpost' } })
    await container.pool.query(`UPDATE fulfillment_cases SET dispatched_at = now() - interval '8 days' WHERE order_id = $1`, [orderId])
    await inTx((tx) => container.orders.confirm.sweepHoldRelease(tx as never, {
      listCases: (t, oid) => container.operations.fulfillment.listByOrder(t as never, oid),
      releaseHold: (t, input) => container.payments.service.releaseHold(t as never, input),
      policy: holdReleaseDue,
    }))
    await drain()
    const payout = mailbox().find((msg) => msg.to === ownerEmail && msg.subject.includes('now payable'))
    expect(payout).toBeTruthy()
    expect(payout!.body).toMatch(/Nothing to do/)
  })
})
