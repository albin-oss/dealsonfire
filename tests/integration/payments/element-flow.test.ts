/**
 * Payment Element convergence (C10 Slice 2) — the sandbox twin mirrors the
 * client-confirmation flow (NUXT_SANDBOX_CLIENT_CONFIRMATION=1) so every
 * hostile ordering is provable without Stripe:
 *   client return before webhook · webhook before client return · duplicates
 *   of both · browser refresh mid-payment · failed-then-retried confirmation ·
 *   abandoned payment (24h honest closure + void).
 * The invariant everywhere: ONE order, ONE capture, stock committed exactly
 * once, nothing charged before the buyer's confirmation became provider truth.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { completePaymentAuthorization } from '../../../server/utils/payment-completion'
import type { SandboxProviderTwin } from '@domains/payments/application/payments'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function shelvedWorld() {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `el-${uuidv7()}@maker.example`, password: 'a long passphrase' } })
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
  return { variantId: pub.body.product.variants[0].id as string }
}

async function placeAwaiting(variantId: string) {
  const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: variantId, quantity: 1 } })
  const cookie = `dof_visitor=${/dof_visitor=([^;]+)/.exec(add.headers.get('set-cookie') ?? '')![1]}`
  const attemptKey = uuidv7()
  const co = await http.request('POST', '/api/v1/public/checkout', {
    headers: { cookie },
    body: { attempt_key: attemptKey, cart_id: add.body.cart_id, contact: { name: 'Jonas', email: 'jonas@buyer.example' }, delivery: { line1: 'K 1', city: 'A', postal_code: '2000', country: 'BE' } },
  })
  expect(co.body.ok).toBe(true)
  expect(co.body.payment).toBeTruthy() // the Element session
  expect(co.body.payment.client_secret).toMatch(/^sandbox-cs-/)
  return { cookie, attemptKey, orderId: co.body.order_id as string, cartId: add.body.cart_id as string }
}

const providerRefOf = async (attemptKey: string) => {
  const { rows } = await container.pool.query<{ provider_ref: string }>(
    `SELECT provider_ref FROM payment_intents WHERE attempt_key = $1`, [attemptKey])
  return rows[0]!.provider_ref
}

const moneyPicture = async (orderId: string) => {
  const { rows: o } = await container.pool.query(`SELECT state FROM orders WHERE id = $1`, [orderId])
  const { rows: i } = await container.pool.query(`SELECT state, captured_minor::int AS c FROM payment_intents`)
  const { rows: f } = await container.pool.query(`SELECT count(*)::int AS n FROM payment_facts WHERE kind = 'captured'`)
  return { order: o[0]?.state, intent: i[0]?.state, captured: i[0]?.c, captureFacts: f[0].n }
}

beforeAll(async () => {
  process.env.NUXT_SANDBOX_CLIENT_CONFIRMATION = '1' // BEFORE the container captures it
  container = newTestContainer()
  setContainer(container)
  http = await startTestApp()
})
afterAll(async () => {
  await http.close(); setContainer(null); await container.shutdown()
  delete process.env.NUXT_SANDBOX_CLIENT_CONFIRMATION
})
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('C10 Slice 2 — Element convergence', () => {
  it('client return BEFORE webhook: placed → buyer confirms → settled; one order, one capture, honest sequencing', async () => {
    const { variantId } = await shelvedWorld()
    const { cookie, attemptKey, orderId } = await placeAwaiting(variantId)

    // before confirmation: order placed, intent awaiting, NOTHING committed or charged
    const before = await moneyPicture(orderId)
    expect(before).toMatchObject({ order: 'placed', intent: 'requires_action', captured: 0 })
    const { rows: committed } = await container.pool.query(`SELECT count(*)::int AS n FROM reservations WHERE status = 'committed'`)
    expect(committed[0].n).toBe(0)

    // the buyer's browser confirms; the return path converges (no webhook needed)
    await http.request('POST', '/api/v1/public/checkout/sandbox-confirm', { headers: { cookie }, body: { attempt_key: attemptKey } })
    const done = await http.request('POST', '/api/v1/public/checkout/complete', { headers: { cookie }, body: { attempt_key: attemptKey } })
    expect(done.body.status).toBe('settled')

    const after = await moneyPicture(orderId)
    expect(after).toMatchObject({ order: 'confirmed', intent: 'captured', captured: 4500, captureFacts: 1 })
    // the facts tell the WHOLE story in order: created → authorized → captured
    const { rows: facts } = await container.pool.query(`SELECT kind FROM payment_facts ORDER BY occurred_at`)
    expect(facts.map((f) => f.kind)).toEqual(['created', 'authorized', 'captured'])
  })

  it('webhook BEFORE client return + duplicates of both: everything converges on one capture', async () => {
    const { variantId } = await shelvedWorld()
    const { cookie, attemptKey, orderId } = await placeAwaiting(variantId)
    const ref = await providerRefOf(attemptKey)
    ;(container.payments.providerInstance as SandboxProviderTwin).confirmClientSide(ref)

    // the webhook's half arrives FIRST — twice (Stripe retries)
    await completePaymentAuthorization(container, ref)
    await completePaymentAuthorization(container, ref)
    // then the client returns — twice (double-tap)
    const [a, b] = await Promise.all([
      http.request('POST', '/api/v1/public/checkout/complete', { headers: { cookie }, body: { attempt_key: attemptKey } }),
      http.request('POST', '/api/v1/public/checkout/complete', { headers: { cookie }, body: { attempt_key: attemptKey } }),
    ])
    expect(a.body.status).toBe('settled')
    expect(b.body.status).toBe('settled')

    const picture = await moneyPicture(orderId)
    expect(picture).toMatchObject({ order: 'confirmed', intent: 'captured', captured: 4500, captureFacts: 1 })
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM orders`)
    expect(rows[0].n).toBe(1)
  })

  it('browser refresh mid-payment: the same attempt re-asks and gets its session back — same order, no duplicates', async () => {
    const { variantId } = await shelvedWorld()
    const { cookie, attemptKey, orderId, cartId } = await placeAwaiting(variantId)
    const again = await http.request('POST', '/api/v1/public/checkout', {
      headers: { cookie },
      body: { attempt_key: attemptKey, cart_id: cartId, contact: { name: 'Jonas', email: 'jonas@buyer.example' }, delivery: { line1: 'K 1', city: 'A', postal_code: '2000', country: 'BE' } },
    })
    expect(again.body.ok).toBe(true)
    expect(again.body.order_id).toBe(orderId) // the SAME order
    expect(again.body.payment?.client_secret).toMatch(/^sandbox-cs-/) // the session survives refresh
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM orders`)
    expect(rows[0].n).toBe(1)
  })

  it('a failed confirmation retries in place: failed → the buyer tries again → settled', async () => {
    const { variantId } = await shelvedWorld()
    const { cookie, attemptKey, orderId } = await placeAwaiting(variantId)
    await http.request('POST', '/api/v1/public/checkout/sandbox-confirm', { headers: { cookie }, body: { attempt_key: attemptKey, outcome: 'failed' } })
    const failed = await http.request('POST', '/api/v1/public/checkout/complete', { headers: { cookie }, body: { attempt_key: attemptKey } })
    expect(failed.body.status).toBe('failed')
    expect((await moneyPicture(orderId)).captured).toBe(0) // nothing charged on failure

    await http.request('POST', '/api/v1/public/checkout/sandbox-confirm', { headers: { cookie }, body: { attempt_key: attemptKey, outcome: 'authorized' } })
    const done = await http.request('POST', '/api/v1/public/checkout/complete', { headers: { cookie }, body: { attempt_key: attemptKey } })
    expect(done.body.status).toBe('settled')
    expect(await moneyPicture(orderId)).toMatchObject({ order: 'confirmed', captured: 4500, captureFacts: 1 })
  })

  it('abandoned payment: the 24h honest closure voids the unconfirmed intent and frees the story', async () => {
    const { variantId } = await shelvedWorld()
    const { attemptKey, orderId } = await placeAwaiting(variantId)
    // the sweep leaves the order alone while the buyer might still be paying
    const early = await container.deps.uow.withTransaction((tx) => container.orders.confirm.sweepUnconfirmed(tx))
    expect((await moneyPicture(orderId)).order).toBe('placed')
    expect(early.voidRefs).toHaveLength(0)

    // …but 24h of silence is an answer
    await container.pool.query(`UPDATE orders SET placed_at = now() - interval '25 hours' WHERE id = $1`, [orderId])
    const swept = await container.deps.uow.withTransaction((tx) => container.orders.confirm.sweepUnconfirmed(tx))
    expect(swept.voidRefs).toHaveLength(1)
    for (const ref of swept.voidRefs) {
      const { opId } = await container.deps.uow.withTransaction((tx) => container.payments.service.requestVoid(tx, ref))
      await container.payments.boundary.drive(opId)
    }
    const picture = await moneyPicture(orderId)
    expect(picture.order).toBe('payment_failed')
    expect(picture.intent).toBe('voided')
    // and a late buyer return answers honestly instead of resurrecting the order
    const ref = await providerRefOf(attemptKey)
    const read = await container.payments.boundary.readIntent(ref)
    expect(read.status).toBe('canceled')
  })
})
