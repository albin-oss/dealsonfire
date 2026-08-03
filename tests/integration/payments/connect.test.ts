/**
 * Stripe Connect machinery (C10 Slice 3) against the twin, with the onboarding
 * gate armed (NUXT_REQUIRE_MERCHANT_ONBOARDING=1) and a real fee policy
 * (NUXT_PLATFORM_FEE_BPS=1000 — 10%, illustration value):
 *   onboarding walk → till opens · un-onboarded till → checkout closed, street
 *   presence intact · restriction mid-life closes ONLY the checkout door +
 *   letters the maker · recovery reopens · the fee peels into platform_fees
 *   with L1/L3 intact · payoutAllowed guards the negative payable.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import type { SandboxProviderTwin } from '@domains/payments/application/payments'
import type { SandboxMailer } from '@platform/mail'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const inTx = <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
  container.deps.uow.withTransaction(fn as never) as Promise<T>
const twin = () => container.payments.providerInstance as SandboxProviderTwin

async function merchant() {
  const email = `cx-${uuidv7()}@maker.example`
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email, password: 'a long passphrase' } })
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
  return { cookie, email, businessId: biz.body.business_id as string, handle, variantId: pub.body.product.variants[0].id as string }
}

async function tryCheckout(variantId: string) {
  const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: variantId, quantity: 1 } })
  const cookie = `dof_visitor=${/dof_visitor=([^;]+)/.exec(add.headers.get('set-cookie') ?? '')![1]}`
  const res = await http.request('POST', '/api/v1/public/checkout', {
    headers: { cookie },
    body: { attempt_key: uuidv7(), cart_id: add.body.cart_id, contact: { name: 'Jonas', email: 'jonas@buyer.example' }, delivery: { line1: 'K 1', city: 'A', postal_code: '2000', country: 'BE' } },
  })
  return Object.assign(res, { buyerCookie: cookie })
}

async function onboard(m: Awaited<ReturnType<typeof merchant>>) {
  const walk = await http.request('POST', `/api/v1/businesses/${m.businessId}/payments/onboarding`, { headers: { cookie: m.cookie }, body: {} })
  expect(walk.body.url).toContain('/settings?stripe=return') // the twin's link IS the walk
  const synced = await http.request('GET', `/api/v1/businesses/${m.businessId}/payments?sync=1`, { headers: { cookie: m.cookie } })
  return synced.body
}

beforeAll(async () => {
  process.env.NUXT_REQUIRE_MERCHANT_ONBOARDING = '1'
  process.env.NUXT_PLATFORM_FEE_BPS = '1000' // 10% — an illustration value, never the Founder's decision
  container = newTestContainer()
  setContainer(container)
  http = await startTestApp()
})
afterAll(async () => {
  await http.close(); setContainer(null); await container.shutdown()
  delete process.env.NUXT_REQUIRE_MERCHANT_ONBOARDING
  delete process.env.NUXT_PLATFORM_FEE_BPS
})
beforeEach(async () => {
  await truncateAll(container.pool)
  ;(container.rateLimiter as { reset?: () => void }).reset?.()
  ;(container.mail as SandboxMailer).outbox.length = 0
})

describe('C10 Slice 3 — Connect', () => {
  it('the walk to the teller: onboarding opens the till; checkout opens with it; the fee peels honestly', async () => {
    const m = await merchant()
    // before onboarding: the storefront is on the street, the checkout door is closed
    const closed = await tryCheckout(m.variantId)
    expect(closed.body.ok).toBe(false)
    expect(closed.body.code).toBe('CHECKOUT_CLOSED')
    expect(closed.body.detail).toMatch(/browsable/)
    const street = await http.request('GET', `/api/v1/public/stores/${m.handle}`)
    expect(street.status).toBe(200) // street presence intact

    const status = await onboard(m)
    expect(status).toMatchObject({ charges_enabled: true, payouts_enabled: true, onboarding_state: 'complete' })

    const open = await tryCheckout(m.variantId)
    expect(open.body.ok).toBe(true)
    // the fee policy (10%) peeled into platform_fees at capture; L1 balances; L3 clean
    const { rows: accounts } = await container.pool.query(
      `SELECT kind, balance_minor::int AS b FROM ledger_accounts WHERE balance_minor <> 0 ORDER BY kind`)
    const holding = accounts.find((a) => a.kind === 'merchant_holding')
    const fees = accounts.find((a) => a.kind === 'platform_fees')
    expect(holding?.b).toBe(4050) // 4500 − 450
    expect(fees?.b).toBe(450)
    const { rows: sum } = await container.pool.query(`SELECT COALESCE(sum(delta_minor),0)::int AS s FROM ledger_entries`)
    expect(sum[0].s).toBe(0)
    const check = await inTx((tx) => container.payments.service.ledger.recomputeCheck(tx as never))
    expect(check.clean).toBe(true)
    // the journaled authorize resolved the DESTINATION from the snapshot
    const { rows: profile } = await container.pool.query(
      `SELECT provider_account FROM merchant_payment_profiles WHERE business_id = $1`, [m.businessId])
    expect(profile[0].provider_account).toMatch(/^sandbox-acct-/)

    // CERTIFICATION FINDING (live-caught): a refund with an application fee must
    // return the FEE from the platform — the maker bears only the net (matching
    // Stripe's refund_application_fee). Full refund here: fee comes fully home.
    const orderId = open.body.order_id as string
    const cancel = await http.request('POST', `/api/v1/public/orders/${orderId}/cancel`, { headers: { cookie: open.buyerCookie } })
    expect(cancel.body.outcome).toBe('cancelled')
    const { rows: after } = await container.pool.query(
      `SELECT kind, balance_minor::int AS b FROM ledger_accounts WHERE kind IN ('merchant_holding','platform_fees') ORDER BY kind`)
    expect(after.find((a) => a.kind === 'merchant_holding')?.b).toBe(0) // maker refunded their NET (4050), not the gross
    expect(after.find((a) => a.kind === 'platform_fees')?.b).toBe(0)   // the fee went home with the refund
    const post = await inTx((tx) => container.payments.service.ledger.recomputeCheck(tx as never))
    expect(post.clean).toBe(true)
  })

  it('restriction mid-life: ONLY the checkout door closes; the letter says why; recovery reopens', async () => {
    const m = await merchant()
    await onboard(m)
    const { rows: prof } = await container.pool.query(
      `SELECT provider_account FROM merchant_payment_profiles WHERE business_id = $1`, [m.businessId])
    const acct = prof[0].provider_account as string

    // the provider restricts (as account.updated would tell us)
    twin().setAccountState(acct, { chargesEnabled: false, payoutsEnabled: false, disabledReason: 'requirements.past_due' })
    const state = await container.payments.boundary.connectReadAccount(acct)
    await inTx((tx) => container.payments.service.applyAccountSnapshot(tx as never, { accountId: acct, state }))

    const closed = await tryCheckout(m.variantId)
    expect(closed.body.code).toBe('CHECKOUT_CLOSED')
    const street = await http.request('GET', `/api/v1/public/stores/${m.handle}`)
    expect(street.status).toBe(200) // the storefront never blinked

    // the letter reached the maker with the reason and the way back
    await container.payments.dispatcher.dispatchPending()
    const letters = (container.mail as SandboxMailer).outbox
    const paused = letters.find((l) => l.to === m.email && /till is paused/.test(l.subject))
    expect(paused).toBeTruthy()
    expect(paused!.body).toMatch(/requirements.past_due/)
    expect(paused!.body).toMatch(/only the checkout door/)

    // recovery: the provider restores; the door reopens; the letter says so
    twin().setAccountState(acct, { chargesEnabled: true, payoutsEnabled: true, disabledReason: null })
    const restored = await container.payments.boundary.connectReadAccount(acct)
    await inTx((tx) => container.payments.service.applyAccountSnapshot(tx as never, { accountId: acct, state: restored }))
    const reopened = await tryCheckout(m.variantId)
    expect(reopened.body.ok).toBe(true)
    await container.payments.dispatcher.dispatchPending()
    expect((container.mail as SandboxMailer).outbox.some((l) => l.to === m.email && /till is open/.test(l.subject))).toBe(true)
  })

  it('the snapshot only speaks when something changed; payoutAllowed guards the negative payable', async () => {
    const m = await merchant()
    await onboard(m)
    const { rows: prof } = await container.pool.query(
      `SELECT provider_account, payouts_enabled FROM merchant_payment_profiles WHERE business_id = $1`, [m.businessId])
    const acct = prof[0].provider_account as string
    // an unchanged snapshot emits NO event (no letter spam on webhook replays)
    const state = await container.payments.boundary.connectReadAccount(acct)
    const first = await inTx((tx) => container.payments.service.applyAccountSnapshot(tx as never, { accountId: acct, state }))
    expect(first.changed).toBe(false)
    const { rows: events } = await container.pool.query(
      `SELECT count(*)::int AS n FROM payments_domain_events WHERE event_type = 'payments.account.updated'`)
    expect(events[0].n).toBe(1) // exactly the ONE from onboarding completion

    // RM-H5: the payout gate — never for disabled accounts, never into a negative
    const svc = container.payments.service
    expect(svc.payoutAllowed({ payouts_enabled: true }, 5000)).toBe(true)
    expect(svc.payoutAllowed({ payouts_enabled: true }, 0)).toBe(false)
    expect(svc.payoutAllowed({ payouts_enabled: true }, -200)).toBe(false)
    expect(svc.payoutAllowed({ payouts_enabled: false }, 5000)).toBe(false)
    expect(svc.payoutAllowed({ payouts_enabled: true }, 5000, 5000)).toBe(false) // frozen by a dispute
  })
})
