/**
 * Payouts (C11 S1) — the money's last mile, §7-shaped, ZERO new persistence:
 * the journal executes, the LEDGER is the permanent record (posting cause
 * carries period + provider payout id). Hostile: gates (threshold, disabled,
 * paused, no account), dispute netting, period idempotency across schedule
 * change, racing drivers, crash recovery, transient balance waits. L3 clean
 * throughout.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { SANDBOX_REFUND_FAIL_AMOUNT_MINOR } from '@domains/payments/application/payments'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const inTx = <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
  container.deps.uow.withTransaction(fn as never) as Promise<T>

async function merchant(priceMinor = 4500) {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `po-${uuidv7()}@maker.example`, password: 'a long passphrase' } })
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
  // the teller's walk (twin): account + payouts_enabled land on the profile
  await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/payments/onboarding`, { headers: { cookie }, body: {} })
  await http.request('GET', `/api/v1/businesses/${biz.body.business_id}/payments?sync=1`, { headers: { cookie } })
  return { cookie, businessId: biz.body.business_id as string, variantId: pub.body.product.variants[0].id as string }
}

/** Buy + release the hold — payable is born (C6's eligibility law, unchanged). */
async function payableWorld(m: Awaited<ReturnType<typeof merchant>>) {
  const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: m.variantId, quantity: 1 } })
  const cookie = `dof_visitor=${/dof_visitor=([^;]+)/.exec(add.headers.get('set-cookie') ?? '')![1]}`
  const co = await http.request('POST', '/api/v1/public/checkout', {
    headers: { cookie },
    body: { attempt_key: uuidv7(), cart_id: add.body.cart_id, contact: { name: 'Jonas', email: 'jonas@buyer.example' }, delivery: { line1: 'K 1', city: 'A', postal_code: '2000', country: 'BE' } },
  })
  expect(co.body.ok).toBe(true)
  await inTx((tx) => container.payments.service.releaseHold(tx as never, { orderId: co.body.order_id, causeKey: `test:${co.body.order_id}` }))
  return { orderId: co.body.order_id as string }
}

const sweep = async () => {
  const prepared = await inTx((tx) => container.payments.service.preparePayoutSweep(tx as never))
  let settled = 0
  for (const opId of prepared.opIds) {
    const r = await container.payments.boundary.drive(opId)
    if (r.settled) settled += 1
  }
  return { ...prepared, settled }
}

const balances = async (businessId: string) => {
  const { rows } = await container.pool.query<{ kind: string; b: number }>(
    `SELECT kind, sum(balance_minor)::int AS b FROM ledger_accounts WHERE business_id = $1 OR business_id IS NULL GROUP BY kind`, [businessId])
  return Object.fromEntries(rows.map((r) => [r.kind, r.b]))
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
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('C11 S1 — the payout sweep', () => {
  it('pays the payable, ONCE per period; the LEDGER is the permanent record; nothing else to pay next tick', async () => {
    const m = await merchant()
    await payableWorld(m)
    let b = await balances(m.businessId)
    expect(b.merchant_payable).toBe(4500)

    const first = await sweep()
    expect(first).toMatchObject({ settled: 1 })
    b = await balances(m.businessId)
    expect(b.merchant_payable).toBe(0)
    // the permanent record: posting cause carries period + provider payout id (PE review §3.1)
    const { rows: record } = await container.pool.query(
      `SELECT e.cause->>'period' AS period, e.cause->>'provider_payout_id' AS po
       FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id
       WHERE a.kind = 'merchant_payable' AND a.business_id = $1 AND e.cause->>'kind' = 'payout'`, [m.businessId])
    expect(record[0].period).toBe('1')
    expect(record[0].po).toMatch(/^sandbox-po-/)
    // journal carries the same identity for reconciliation
    const { rows: op } = await container.pool.query(`SELECT provider_ref, state FROM provider_operations WHERE kind = 'payout'`)
    expect(op[0].state).toBe('succeeded')
    expect(op[0].provider_ref).toBe(record[0].po)
    // nothing left to pay: next tick prepares nothing
    const again = await sweep()
    expect(again.opIds).toHaveLength(0)
    const check = await inTx((tx) => container.payments.service.ledger.recomputeCheck(tx as never))
    expect(check.clean).toBe(true)
  })

  it('the gates hold: below-threshold, payouts-disabled, risk-paused, and account-less merchants accrue but never pay', async () => {
    const cheap = await merchant(500) // below the €10 minimum
    await payableWorld(cheap)
    const disabled = await merchant()
    await payableWorld(disabled)
    await container.pool.query(`UPDATE merchant_payment_profiles SET payouts_enabled = false WHERE business_id = $1`, [disabled.businessId])
    const paused = await merchant()
    await payableWorld(paused)
    await inTx((tx) => container.payments.service.riskPause(tx as never, paused.businessId, 'test pause'))
    const bankless = await merchant()
    await payableWorld(bankless)
    await container.pool.query(`UPDATE merchant_payment_profiles SET provider_account = NULL WHERE business_id = $1`, [bankless.businessId])

    const swept = await sweep()
    expect(swept.opIds).toHaveLength(0)
    expect(swept.skipped).toBe(4)
    for (const m of [cheap, disabled, paused, bankless]) {
      const b = await balances(m.businessId)
      expect(b.merchant_payable).toBeGreaterThan(0) // accrued, untouched, visible
    }
  })

  it('open disputes NET against the payout; a won dispute releases the money into the next period', async () => {
    const m = await merchant()
    const { orderId } = await payableWorld(m) // payable 4500
    const { rows: intent } = await container.pool.query(`SELECT provider_ref FROM payment_intents WHERE order_id = $1`, [orderId])
    const dp = `dp_${uuidv7().slice(-8)}`
    // dispute after release: freeze finds no holding → UNCOVERED exposure 4500
    await inTx((tx) => container.payments.service.openDispute(tx as never, {
      providerDisputeId: dp, providerRef: intent[0].provider_ref, amountMinor: 4500, currency: 'EUR', reason: null, evidenceDueAt: null,
    }))
    const held = await sweep()
    expect(held.opIds).toHaveLength(0) // payoutable = 4500 − 4500 uncovered = 0

    await inTx((tx) => container.payments.service.resolveDispute(tx as never, { providerDisputeId: dp, outcome: 'won' }))
    const freed = await sweep()
    expect(freed.settled).toBe(1) // the whole payable pays out once the dispute clears
    const b = await balances(m.businessId)
    expect(b.merchant_payable).toBe(0)
  })

  it('periods are ledger-derived, not clock-derived: schedule changes cannot double-pay; the interval gates period 2', async () => {
    const m = await merchant()
    await payableWorld(m)
    await sweep() // period 1 pays

    await payableWorld(m) // new payable accrues
    const tooSoon = await sweep()
    expect(tooSoon.opIds).toHaveLength(0) // interval (7d) not passed — skipped, not lost

    // time passes (backdate the period-1 posting; the ONE derivation reads the ledger)
    await container.pool.query(
      `UPDATE ledger_entries SET created_at = now() - interval '8 days' WHERE cause->>'kind' = 'payout'`)
    const due = await sweep()
    expect(due.settled).toBe(1)
    const { rows: keys } = await container.pool.query(
      `SELECT idempotency_key FROM provider_operations WHERE kind = 'payout' ORDER BY created_at`)
    expect(keys.map((k) => k.idempotency_key)).toEqual([
      `payout:${m.businessId}:1`, `payout:${m.businessId}:2`,
    ]) // period numbers are payout-count-derived — no wall-clock bucket can collide
  })

  it('racing drivers settle ONE payout exactly once; a crash between phases recovers via the driver', async () => {
    const m = await merchant()
    await payableWorld(m)
    const prepared = await inTx((tx) => container.payments.service.preparePayoutSweep(tx as never))
    expect(prepared.opIds).toHaveLength(1)
    const results = await Promise.all(Array.from({ length: 6 }, () => container.payments.boundary.drive(prepared.opIds[0]!)))
    expect(results.filter((r) => r.settled)).toHaveLength(1)
    const b = await balances(m.businessId)
    expect(b.merchant_payable).toBe(0) // moved once

    // crash shape: a second merchant's op journals, then the process "dies" — driveAll converges
    const m2 = await merchant()
    await payableWorld(m2)
    const stranded = await inTx((tx) => container.payments.service.preparePayoutSweep(tx as never))
    expect(stranded.opIds).toHaveLength(1)
    await container.pool.query(`UPDATE provider_operations SET updated_at = now() - interval '5 minutes' WHERE id = $1`, [stranded.opIds[0]])
    const recovered = await container.payments.boundary.driveAll()
    expect(recovered.settled).toBe(1)
    const b2 = await balances(m2.businessId)
    expect(b2.merchant_payable).toBe(0)
  })

  it('an unavailable connected balance is a WAIT, not a loss: the driver retries and the payout lands', async () => {
    const m = await merchant(SANDBOX_REFUND_FAIL_AMOUNT_MINOR) // the twin waits once at this amount
    await payableWorld(m)
    const prepared = await inTx((tx) => container.payments.service.preparePayoutSweep(tx as never))
    const first = await container.payments.boundary.drive(prepared.opIds[0]!)
    expect(first.settled).toBe(false) // balance not yet available — op stays pending
    const { rows: pendingOp } = await container.pool.query(`SELECT state, last_error FROM provider_operations WHERE kind = 'payout'`)
    expect(pendingOp[0].state).toBe('pending')
    expect(pendingOp[0].last_error).toMatch(/not yet available/)
    const b1 = await balances(m.businessId)
    expect(b1.merchant_payable).toBe(SANDBOX_REFUND_FAIL_AMOUNT_MINOR) // nothing moved

    await container.pool.query(`UPDATE provider_operations SET updated_at = now() - interval '5 minutes'`)
    const retried = await container.payments.boundary.driveAll()
    expect(retried.settled).toBe(1) // the wait ended; money moved exactly once
    const b2 = await balances(m.businessId)
    expect(b2.merchant_payable).toBe(0)
    const check = await inTx((tx) => container.payments.service.ledger.recomputeCheck(tx as never))
    expect(check.clean).toBe(true)
  })
})
