/**
 * Payout lifecycle (C11 S2): the payout's LATER truths — paid (letter), failed
 * (money comes HOME + re-armed retry + honest letter), duplicate outcome
 * webhooks converge, the sweep never double-pays while a retry is in flight,
 * the maker's money story tells it all in three numbers, and reconciliation
 * matches payouts by IDENTITY.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import type { SandboxMailer } from '@platform/mail'
import type { SandboxProviderTwin } from '@domains/payments/application/payments'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const inTx = <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
  container.deps.uow.withTransaction(fn as never) as Promise<T>

async function merchant(priceMinor = 4500) {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `pl-${uuidv7()}@maker.example`, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle } })
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
  const p = await http.request('POST', '/api/v1/products', {
    headers: { cookie },
    body: { business_id: biz.body.business_id, title: 'Blanket', fulfillment_kind: 'physical', default_price: { amount: priceMinor, currency: 'EUR' }, publish_to_store_id: store.body.store_id },
  })
  const pub = await http.request('GET', `/api/v1/public/stores/${handle}/products/${p.body.product_id}`)
  await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/payments/onboarding`, { headers: { cookie }, body: {} })
  await http.request('GET', `/api/v1/businesses/${biz.body.business_id}/payments?sync=1`, { headers: { cookie } })
  const reg2 = await http.request('GET', '/api/v1/auth/session', { headers: { cookie } })
  return { cookie, businessId: biz.body.business_id as string, variantId: pub.body.product.variants[0].id as string, email: reg2.body.email ?? `pl@maker.example`, ownEmail: `pl-${uuidv7()}` }
}

async function paidOutWorld(m: Awaited<ReturnType<typeof merchant>>) {
  const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: m.variantId, quantity: 1 } })
  const cookie = `dof_visitor=${/dof_visitor=([^;]+)/.exec(add.headers.get('set-cookie') ?? '')![1]}`
  const co = await http.request('POST', '/api/v1/public/checkout', {
    headers: { cookie },
    body: { attempt_key: uuidv7(), cart_id: add.body.cart_id, contact: { name: 'Jonas', email: 'jonas@buyer.example' }, delivery: { line1: 'K 1', city: 'A', postal_code: '2000', country: 'BE' } },
  })
  expect(co.body.ok).toBe(true)
  await inTx((tx) => container.payments.service.releaseHold(tx as never, { orderId: co.body.order_id, causeKey: `test:${co.body.order_id}` }))
  const prepared = await inTx((tx) => container.payments.service.preparePayoutSweep(tx as never))
  for (const opId of prepared.opIds) await container.payments.boundary.drive(opId)
  const { rows } = await container.pool.query(
    `SELECT provider_ref FROM provider_operations WHERE kind = 'payout' AND business_id = $1 ORDER BY created_at DESC LIMIT 1`, [m.businessId])
  return { payoutId: rows[0].provider_ref as string, orderId: co.body.order_id as string }
}

beforeAll(async () => {
  process.env.NUXT_PAYOUT_MIN_MINOR = '1000'
  process.env.NUXT_PAYOUT_INTERVAL_DAYS = '7'
  container = newTestContainer()
  setContainer(container)
  http = await startTestApp()
})
afterAll(async () => {
  await http.close(); setContainer(null); await container.shutdown()
  delete process.env.NUXT_PAYOUT_MIN_MINOR
  delete process.env.NUXT_PAYOUT_INTERVAL_DAYS
})
beforeEach(async () => {
  await truncateAll(container.pool)
  ;(container.rateLimiter as { reset?: () => void }).reset?.()
  ;(container.mail as SandboxMailer).outbox.length = 0
  ;(container.payments.providerInstance as SandboxProviderTwin).resetRecordedTransactions()
})

describe('C11 S2 — the payout lifecycle', () => {
  it('paid: the letter goes out with bank timing; the money story says "arrived"; duplicates converge', async () => {
    const m = await merchant()
    const { payoutId } = await paidOutWorld(m)

    await inTx((tx) => container.payments.service.handlePayoutOutcome(tx as never, { providerPayoutId: payoutId, outcome: 'paid' }))
    await inTx((tx) => container.payments.service.handlePayoutOutcome(tx as never, { providerPayoutId: payoutId, outcome: 'paid' })) // replay
    await container.payments.dispatcher.dispatchPending()

    const letters = (container.mail as SandboxMailer).outbox.filter((l) => /on its way to your bank/.test(l.subject))
    expect(letters).toHaveLength(1) // the replay appended nothing — one letter, ever
    expect(letters[0]!.body).toMatch(/a day or two/) // bank timing set where the expectation forms
    const story = await inTx((tx) => container.payments.service.moneyStory(tx as never, m.businessId))
    expect(story.history[0]).toMatchObject({ status: 'arrived', provider_payout_id: payoutId })
    expect(story.ready_minor).toBe(0)
    expect(story.paid_minor).toBe(4500)
  })

  it('failed: the money comes HOME, the retry re-arms, the honest letter leads with safety; the sweep never double-pays in flight', async () => {
    const m = await merchant()
    const { payoutId } = await paidOutWorld(m)
    let story = await inTx((tx) => container.payments.service.moneyStory(tx as never, m.businessId))
    expect(story.ready_minor).toBe(0) // paid out

    await inTx((tx) => container.payments.service.handlePayoutOutcome(tx as never, {
      providerPayoutId: payoutId, outcome: 'failed', detail: 'account closed' }))
    await inTx((tx) => container.payments.service.handlePayoutOutcome(tx as never, {
      providerPayoutId: payoutId, outcome: 'failed', detail: 'replay' })) // duplicate webhook

    // the money came home EXACTLY once
    const { rows: payable } = await container.pool.query(
      `SELECT balance_minor::int AS b FROM ledger_accounts WHERE kind='merchant_payable' AND business_id = $1`, [m.businessId])
    expect(payable[0].b).toBe(4500)
    // a retry op re-armed under :r1
    const { rows: retry } = await container.pool.query(
      `SELECT idempotency_key, state FROM provider_operations WHERE kind='payout' AND state='pending'`)
    expect(retry).toHaveLength(1)
    expect(retry[0].idempotency_key).toMatch(/:r1$/)
    // the sweep will NOT journal a new period while the retry is in flight
    const swept = await inTx((tx) => container.payments.service.preparePayoutSweep(tx as never))
    expect(swept.opIds).toHaveLength(0)
    // the letter: safety first
    await container.payments.dispatcher.dispatchPending()
    const letter = (container.mail as SandboxMailer).outbox.find((l) => /needs another try/.test(l.subject))
    expect(letter?.body).toMatch(/safe with us/)
    // the story shows the failed payout honestly + money back in ready
    story = await inTx((tx) => container.payments.service.moneyStory(tx as never, m.businessId))
    expect(story.ready_minor).toBe(4500)
    expect(story.history[0]!.status).toBe('needs_another_try')
    expect(story.paid_minor).toBe(0)
    // the retry drives → money moves again, once; L3 clean
    const { rows: retryRow } = await container.pool.query(
      `SELECT id FROM provider_operations WHERE idempotency_key = $1`, [retry[0]!.idempotency_key])
    await container.payments.boundary.drive(retryRow[0].id)
    const { rows: after } = await container.pool.query(
      `SELECT balance_minor::int AS b FROM ledger_accounts WHERE kind='merchant_payable' AND business_id = $1`, [m.businessId])
    expect(after[0].b).toBe(0)
    const check = await inTx((tx) => container.payments.service.ledger.recomputeCheck(tx as never))
    expect(check.clean).toBe(true)
  })

  it('reconciliation matches payouts by IDENTITY; the alarms queue carries the payout truths', async () => {
    const m = await merchant()
    await paidOutWorld(m)
    const recon = await container.payments.reconciliation.maybeRun(true)
    expect(recon.unmatched).toBe(0)
    const { rows: items } = await container.pool.query(
      `SELECT note FROM reconciliation_items WHERE kind = 'payout'`)
    expect(items[0].note).toMatch(/payout ↔ journal sandbox-po-/)

    // alarms: a stuck payout op surfaces
    const m2 = await merchant()
    await container.pool.query(`UPDATE merchant_payment_profiles SET payouts_enabled = true WHERE business_id = $1`, [m2.businessId])
    // stage a pending op aged past an hour with attempts — the stuck shape
    await container.pool.query(`
      INSERT INTO provider_operations (id, kind, provider, idempotency_key, business_id, amount_minor, currency, state, attempts, detail, created_at, updated_at)
      VALUES ($1, 'payout', 'sandbox', $2, $3, 2000, 'EUR', 'pending', 2, '{}', now() - interval '3 hours', now() - interval '2 hours')`,
      [uuidv7(), `payout:${m2.businessId}:9`, m2.businessId])
    const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `ops-${uuidv7()}@dof.example`, password: 'a long passphrase' } })
    const set = reg.headers.get('set-cookie')!
    const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
    const me = await http.request('GET', '/api/v1/auth/session', { headers: { cookie } })
    process.env.NUXT_OPS_USER_IDS = me.body.user_id
    const alarms = await http.request('GET', '/api/v1/ops/alarms', { headers: { cookie } })
    expect(alarms.body.alarms.some((a: { kind: string }) => a.kind === 'payout_stuck')).toBe(true)
  })
})
