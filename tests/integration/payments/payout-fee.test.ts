/**
 * Payout × platform fee (C11 LIVE-CERTIFICATION FINDING): every prior payout
 * suite ran with fee 0, where gross == net — hiding a release that moved the
 * GROSS captured amount into payable while capture had only put the NET into
 * holding. Live Stripe refused the inflated payout (insufficient funds).
 * This world runs with the fee ON: the release, the payout amount, and the
 * partial-refund proportionality must all speak the maker's NET.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import type { SandboxProviderTwin } from '@domains/payments/application/payments'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const inTx = <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
  container.deps.uow.withTransaction(fn as never) as Promise<T>

async function merchant(priceMinor = 4500) {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `pf-${uuidv7()}@maker.example`, password: 'a long passphrase' } })
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
  return { cookie, businessId: biz.body.business_id as string, variantId: pub.body.product.variants[0].id as string }
}

async function capturedOrder(m: Awaited<ReturnType<typeof merchant>>) {
  const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: m.variantId, quantity: 1 } })
  const cookie = `dof_visitor=${/dof_visitor=([^;]+)/.exec(add.headers.get('set-cookie') ?? '')![1]}`
  const co = await http.request('POST', '/api/v1/public/checkout', {
    headers: { cookie },
    body: { attempt_key: uuidv7(), cart_id: add.body.cart_id, contact: { name: 'Jonas', email: 'jonas@buyer.example' }, delivery: { line1: 'K 1', city: 'A', postal_code: '2000', country: 'BE' } },
  })
  expect(co.body.ok).toBe(true)
  return co.body.order_id as string
}

const balances = async (businessId: string) => {
  const { rows } = await container.pool.query(
    `SELECT kind, balance_minor::int AS bal FROM ledger_accounts WHERE business_id = $1 OR business_id IS NULL ORDER BY kind`, [businessId])
  return Object.fromEntries(rows.map((r: { kind: string; bal: number }) => [r.kind, r.bal]))
}

beforeAll(async () => {
  process.env.NUXT_PLATFORM_FEE_BPS = '1000' // the live world's fee — 10%
  process.env.NUXT_PAYOUT_MIN_MINOR = '1000'
  process.env.NUXT_PAYOUT_INTERVAL_DAYS = '7'
  container = newTestContainer()
  setContainer(container)
  http = await startTestApp()
})
afterAll(async () => {
  await http.close(); setContainer(null); await container.shutdown()
  delete process.env.NUXT_PLATFORM_FEE_BPS
  delete process.env.NUXT_PAYOUT_MIN_MINOR
  delete process.env.NUXT_PAYOUT_INTERVAL_DAYS
})
beforeEach(async () => {
  await truncateAll(container.pool)
  ;(container.rateLimiter as { reset?: () => void }).reset?.()
  ;(container.payments.providerInstance as SandboxProviderTwin).resetRecordedTransactions()
})

describe('C11 — the payout speaks the maker\'s NET when the platform fee is on', () => {
  it('release moves captured − fee; the payout pays exactly that; nothing overdraws', async () => {
    const m = await merchant(4500)
    const orderId = await capturedOrder(m)

    let b = await balances(m.businessId)
    expect(b.merchant_holding).toBe(4050) // capture peeled the 10% fee
    expect(b.platform_fees).toBe(450)

    await inTx((tx) => container.payments.service.releaseHold(tx as never, { orderId, causeKey: `test:${orderId}` }))
    b = await balances(m.businessId)
    expect(b.merchant_holding).toBe(0) // the order's holding fully drained — no overdraw
    expect(b.merchant_payable).toBe(4050) // NET, never gross

    const prepared = await inTx((tx) => container.payments.service.preparePayoutSweep(tx as never))
    expect(prepared.opIds).toHaveLength(1)
    const { rows: op } = await container.pool.query(
      `SELECT amount_minor::int AS amount FROM provider_operations WHERE kind = 'payout'`)
    expect(op[0].amount).toBe(4050) // the payout asks Stripe for the maker's net — what her balance truly holds
    for (const opId of prepared.opIds) await container.payments.boundary.drive(opId)

    b = await balances(m.businessId)
    expect(b.merchant_payable).toBe(0)
    const check = await inTx((tx) => container.payments.service.ledger.recomputeCheck(tx as never))
    expect(check.clean).toBe(true)
  })

  it('a partial refund pulls the maker\'s share; the release then moves the remaining net exactly', async () => {
    const m = await merchant(4500)
    const orderId = await capturedOrder(m)

    // refund €9 — fee reverses proportionally (€0.90), maker's share €8.10 leaves holding
    const refund = await inTx((tx) => container.payments.service.prepareRefund(tx as never, {
      orderId, amountMinor: 900, causeKey: 'test-partial', cause: { kind: 'test' } }))
    if (!refund.ok) throw new Error(refund.detail)
    await container.payments.boundary.drive(refund.opId!)

    let b = await balances(m.businessId)
    expect(b.merchant_holding).toBe(3240) // 4050 − 810
    expect(b.platform_fees).toBe(360) // 450 − 90

    await inTx((tx) => container.payments.service.releaseHold(tx as never, { orderId, causeKey: `test:${orderId}` }))
    b = await balances(m.businessId)
    expect(b.merchant_holding).toBe(0) // exact drain — (captured − fee) − (refunded − feeReversed)
    expect(b.merchant_payable).toBe(3240)

    const check = await inTx((tx) => container.payments.service.ledger.recomputeCheck(tx as never))
    expect(check.clean).toBe(true)
  })
})
