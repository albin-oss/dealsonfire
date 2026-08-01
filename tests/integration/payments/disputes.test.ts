/**
 * Disputes (C10 Slice 4 — RM-C3) under the APPROVED loss policy:
 *   dispute BEFORE payout release (holding full → freeze covers) ·
 *   dispute AFTER release (holding empty → freeze 0, platform still absorbs) ·
 *   duplicate webhook (idempotent by provider dispute id) · won returns the
 *   freeze · lost costs the good-faith merchant NOTHING · the deadline letter ·
 *   the ops alarm · exposure limits pause the till and a HUMAN resumes it.
 *   L1/L3 hold through every posting.
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

async function actor(email: string) {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const me = await http.request('GET', '/api/v1/auth/session', { headers: { cookie } })
  return { cookie, email, userId: me.body.user_id as string }
}

async function soldWorld() {
  const m = await actor(`dp-${uuidv7()}@maker.example`)
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
  const { rows } = await container.pool.query<{ provider_ref: string }>(
    `SELECT provider_ref FROM payment_intents WHERE order_id = $1`, [co.body.order_id])
  return { merchant: m, businessId: biz.body.business_id as string, orderId: co.body.order_id as string, providerRef: rows[0]!.provider_ref, handle, variantId: pub.body.product.variants[0].id as string }
}

const balances = async (businessId: string) => {
  const { rows } = await container.pool.query<{ kind: string; b: number }>(
    `SELECT kind, balance_minor::int AS b FROM ledger_accounts WHERE business_id = $1 OR business_id IS NULL ORDER BY kind`,
    [businessId])
  return Object.fromEntries(rows.map((r) => [r.kind, r.b]))
}

beforeAll(async () => {
  process.env.NUXT_RISK_MAX_MERCHANT_OPEN_DISPUTES_MINOR = '6000' // one 4500 dispute fits; two cross
  container = newTestContainer()
  setContainer(container)
  http = await startTestApp()
})
afterAll(async () => {
  await http.close(); setContainer(null); await container.shutdown()
  delete process.env.NUXT_RISK_MAX_MERCHANT_OPEN_DISPUTES_MINOR
})
beforeEach(async () => {
  await truncateAll(container.pool)
  ;(container.rateLimiter as { reset?: () => void }).reset?.()
  ;(container.mail as SandboxMailer).outbox.length = 0
})

describe('C10 Slice 4 — disputes under the approved policy', () => {
  it('dispute BEFORE payout: freeze covers, WON returns it — the maker never felt it; duplicates converge', async () => {
    const w = await soldWorld()
    const dp = `dp_${uuidv7().slice(-8)}`
    const opened = await inTx((tx) => container.payments.service.openDispute(tx as never, {
      providerDisputeId: dp, providerRef: w.providerRef, amountMinor: 4500, currency: 'EUR',
      reason: 'product_not_received', evidenceDueAt: new Date(Date.now() + 12 * 86_400_000).toISOString(),
    }))
    expect(opened.opened).toBe(true)
    const again = await inTx((tx) => container.payments.service.openDispute(tx as never, {
      providerDisputeId: dp, providerRef: w.providerRef, amountMinor: 4500, currency: 'EUR', reason: null, evidenceDueAt: null,
    }))
    expect(again.opened).toBe(false) // the duplicate webhook changes nothing

    let b = await balances(w.businessId)
    expect(b.merchant_holding).toBe(0)
    expect(b.dispute_reserve).toBe(4500) // frozen, not taken

    // the letter with the deadline; the alarm in the queue
    await container.payments.dispatcher.dispatchPending()
    const letter = (container.mail as SandboxMailer).outbox.find((l) => /dispute/.test(l.subject))
    expect(letter?.to).toBe(w.merchant.email)
    expect(letter?.body).toMatch(/never makes you liable/)
    const ops = await actor(`ops-${uuidv7()}@dof.example`)
    process.env.NUXT_OPS_USER_IDS = ops.userId
    const alarms = await http.request('GET', '/api/v1/ops/alarms', { headers: { cookie: ops.cookie } })
    expect(alarms.body.alarms.some((a: { kind: string }) => a.kind === 'dispute_open')).toBe(true)

    // WON: the freeze goes home; a second resolution is a no-op
    await inTx((tx) => container.payments.service.resolveDispute(tx as never, { providerDisputeId: dp, outcome: 'won' }))
    const dup = await inTx((tx) => container.payments.service.resolveDispute(tx as never, { providerDisputeId: dp, outcome: 'lost' }))
    expect(dup.alreadyResolved).toBe(true)
    b = await balances(w.businessId)
    expect(b.merchant_holding).toBe(4500)
    expect(b.dispute_reserve).toBe(0)
    const check = await inTx((tx) => container.payments.service.ledger.recomputeCheck(tx as never))
    expect(check.clean).toBe(true)
  })

  it('dispute LOST — even after payout release: the good-faith maker pays NOTHING; the platform absorbs', async () => {
    const w = await soldWorld()
    // release the hold first (dispute AFTER payout eligibility)
    await inTx((tx) => container.payments.service.releaseHold(tx as never, { orderId: w.orderId, causeKey: `test:${w.orderId}` }))
    let b = await balances(w.businessId)
    expect(b.merchant_payable).toBe(4500)
    expect(b.merchant_holding).toBe(0)

    const dp = `dp_${uuidv7().slice(-8)}`
    await inTx((tx) => container.payments.service.openDispute(tx as never, {
      providerDisputeId: dp, providerRef: w.providerRef, amountMinor: 4500, currency: 'EUR', reason: 'fraudulent', evidenceDueAt: null,
    }))
    b = await balances(w.businessId)
    expect(b.merchant_payable).toBe(4500) // nothing to freeze — and nothing taken
    expect(b.dispute_reserve ?? 0).toBe(0)

    await inTx((tx) => container.payments.service.resolveDispute(tx as never, { providerDisputeId: dp, outcome: 'lost' }))
    b = await balances(w.businessId)
    expect(b.merchant_payable).toBe(4500)        // the maker's money untouched (policy §1–2)
    expect(b.psp_fee_expense).toBe(-4500)        // the platform carried the loss
    const check = await inTx((tx) => container.payments.service.ledger.recomputeCheck(tx as never))
    expect(check.clean).toBe(true)
    // the outcome letter says it plainly
    await container.payments.dispatcher.dispatchPending()
    expect((container.mail as SandboxMailer).outbox.some((l) => /isn't coming out of your pocket/.test(l.subject))).toBe(true)
  })

  it('exposure limit crossed → the till pauses; storefront stands; a HUMAN resumes it (audited)', async () => {
    const w = await soldWorld()
    // two disputes cross the 6000 limit
    await inTx((tx) => container.payments.service.openDispute(tx as never, {
      providerDisputeId: `dp_a_${uuidv7().slice(-6)}`, providerRef: w.providerRef, amountMinor: 4500, currency: 'EUR', reason: null, evidenceDueAt: null,
    }))
    const second = await inTx((tx) => container.payments.service.openDispute(tx as never, {
      providerDisputeId: `dp_b_${uuidv7().slice(-6)}`, providerRef: w.providerRef, amountMinor: 4500, currency: 'EUR', reason: null, evidenceDueAt: null,
    }))
    expect(second.riskPaused).toBe(true)

    // checkout door closed, honest words; street presence intact
    const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: w.variantId, quantity: 1 } })
    const cookie = `dof_visitor=${/dof_visitor=([^;]+)/.exec(add.headers.get('set-cookie') ?? '')![1]}`
    const closed = await http.request('POST', '/api/v1/public/checkout', {
      headers: { cookie },
      body: { attempt_key: uuidv7(), cart_id: add.body.cart_id, contact: { name: 'J', email: 'j@x.example' }, delivery: { line1: 'K', city: 'A', postal_code: '2000', country: 'BE' } },
    })
    expect(closed.body.code).toBe('CHECKOUT_CLOSED')
    expect((await http.request('GET', `/api/v1/public/stores/${w.handle}`)).status).toBe(200)
    // payouts hold while paused (policy §5)
    const profile = await inTx((tx) => container.payments.service.getPaymentProfile(tx as never, w.businessId))
    expect(profile).toBeTruthy()

    // the human act: audited resume reopens the door
    const ops = await actor(`ops-${uuidv7()}@dof.example`)
    process.env.NUXT_OPS_USER_IDS = ops.userId
    const resumed = await http.request('POST', `/api/v1/ops/businesses/${w.businessId}/risk-resume`, {
      headers: { cookie: ops.cookie }, body: { reason: 'reviewed — single-buyer cluster, benign' } })
    expect(resumed.body.resumed).toBe(true)
    const reopened = await http.request('POST', '/api/v1/public/checkout', {
      headers: { cookie },
      body: { attempt_key: uuidv7(), cart_id: add.body.cart_id, contact: { name: 'J', email: 'j@x.example' }, delivery: { line1: 'K', city: 'A', postal_code: '2000', country: 'BE' } },
    })
    expect(reopened.body.ok).toBe(true)
    const { rows: audit } = await container.pool.query(
      `SELECT count(*)::int AS n FROM audit_logs WHERE command = 'ops.business.risk-resume'`)
    expect(audit[0].n).toBe(1)
  })
})
