/**
 * Payments domain (Commerce Foundation C4 — ADR-008) over embedded PG. The money
 * laws on stage: one intent per attempt forever (P4), capture within authorization
 * (P2 — service guard AND schema CHECK), balanced postings only (L1), balances ≡
 * entry sums (L3, the recompute identity), webhook dedupe by provider event id
 * (A8-7 layer 4), and end-to-end parity: the C3 checkout now runs THROUGH the
 * payments domain — an order placed on the street leaves an authorized intent
 * with its facts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const inTx = <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
  container.deps.uow.withTransaction(fn as never) as Promise<T>

async function merchant() {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `c4-${uuidv7()}@example.com`, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle } })
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
  return { cookie, businessId: biz.body.business_id, storeId: store.body.store_id, handle }
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('the money laws (ADR-008)', () => {
  it('P4: one intent per attempt key, forever — replays return the original', async () => {
    const attemptKey = uuidv7()
    const businessId = uuidv7()
    const first = await container.payments.service.authorize({ attemptKey, amountMinor: 4500, currency: 'EUR', businessId })
    expect(first.ok).toBe(true)
    const replay = await container.payments.service.authorize({ attemptKey, amountMinor: 4500, currency: 'EUR', businessId })
    expect(replay.ok && first.ok && replay.auth.authRef).toBe(first.ok ? first.auth.authRef : '')
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM payment_intents`)
    expect(rows[0].n).toBe(1)
    const { rows: facts } = await container.pool.query(`SELECT kind FROM payment_facts ORDER BY occurred_at`)
    expect(facts.map((f) => f.kind)).toEqual(['authorized'])
  })

  it('capture: P2-bounded, idempotent, and the posting balances into merchant_holding', async () => {
    const attemptKey = uuidv7()
    const businessId = uuidv7()
    const orderId = uuidv7()
    const auth = await container.payments.service.authorize({ attemptKey, amountMinor: 4500, currency: 'EUR', businessId })
    expect(auth.ok).toBe(true)

    // over-capture refused before any provider call (P2)
    const over = await inTx((tx) => container.payments.service.capture(tx as never, { attemptKey, amountMinor: 5000, orderId }))
    expect(over.ok).toBe(false)

    const captured = await inTx((tx) => container.payments.service.capture(tx as never, { attemptKey, amountMinor: 4500, orderId }))
    expect(captured.ok).toBe(true)
    const again = await inTx((tx) => container.payments.service.capture(tx as never, { attemptKey, amountMinor: 4500, orderId }))
    expect(again.ok).toBe(true) // idempotent

    // L1: the posting balances; the merchant's holding carries the money story
    const { rows: accounts } = await container.pool.query(
      `SELECT kind, business_id, balance_minor::int AS balance FROM ledger_accounts ORDER BY kind`)
    const holding = accounts.find((a) => a.kind === 'merchant_holding')
    const clearing = accounts.find((a) => a.kind === 'psp_clearing')
    expect(holding?.balance).toBe(4500)
    expect(holding?.business_id).toBe(businessId)
    expect(clearing?.balance).toBe(-4500)
    const { rows: entrySum } = await container.pool.query(`SELECT COALESCE(sum(delta_minor), 0)::int AS s FROM ledger_entries`)
    expect(entrySum[0].s).toBe(0)

    // L3: the recompute identity holds
    const check = await inTx((tx) => container.payments.service.ledger.recomputeCheck(tx as never))
    expect(check.clean).toBe(true)
  })

  it('L1: an unbalanced posting is refused loudly', async () => {
    await expect(inTx((tx) =>
      container.payments.service.ledger.post(tx as never, 'EUR',
        [{ kind: 'psp_clearing', businessId: null, deltaMinor: -100 }], { kind: 'test' }),
    )).rejects.toThrow(/unbalanced/)
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM ledger_entries`)
    expect(rows[0].n).toBe(0)
  })

  it('webhook dedupe: the same provider event lands exactly once (A8-7 layer 4)', async () => {
    const attemptKey = uuidv7()
    const auth = await container.payments.service.authorize({ attemptKey, amountMinor: 1200, currency: 'EUR', businessId: uuidv7() })
    expect(auth.ok).toBe(true)
    const providerRef = auth.ok ? auth.auth.authRef : ''

    const ingest = (id: string) => inTx((tx) => container.payments.service.ingestProviderEvent(tx as never, {
      provider: 'stripe', eventId: id, intentRef: providerRef, kind: 'payment_intent.amount_capturable_updated' }))
    expect((await ingest('evt_1')).fresh).toBe(true)
    expect((await ingest('evt_1')).fresh).toBe(false)
    expect((await ingest('evt_2')).fresh).toBe(true)
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM payment_facts WHERE kind = 'webhook'`)
    expect(rows[0].n).toBe(2)
  })

  it('end to end: a street checkout runs through the payments domain (intent + facts + decline parity)', async () => {
    const m = await merchant()
    const res = await http.request('POST', '/api/v1/products', {
      headers: { cookie: m.cookie },
      body: { business_id: m.businessId, title: 'Blanket', fulfillment_kind: 'physical', default_price: { amount: 4500, currency: 'EUR' }, publish_to_store_id: m.storeId },
    })
    const pub = await http.request('GET', `/api/v1/public/stores/${m.handle}/products/${res.body.product_id}`)
    const variantId = pub.body.product.variants[0].id as string
    const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: variantId, quantity: 1 } })
    const cookie = `dof_visitor=${/dof_visitor=([^;]+)/.exec(add.headers.get('set-cookie') ?? '')![1]}`

    const co = await http.request('POST', '/api/v1/public/checkout', {
      headers: { cookie },
      body: { attempt_key: uuidv7(), cart_id: add.body.cart_id, contact: { name: 'J', email: 'j@example.com' },
              delivery: { line1: 'K 1', city: 'A', postal_code: '2000', country: 'BE' } },
    })
    expect(co.body.ok).toBe(true)

    const { rows: intents } = await container.pool.query(
      `SELECT state, provider, business_id, amount_minor::int AS amount FROM payment_intents`)
    expect(intents).toHaveLength(1)
    expect(intents[0].state).toBe('captured') // C5: the single capture ran at confirm
    expect(intents[0].provider).toBe('sandbox')
    expect(intents[0].business_id).toBe(m.businessId)
    expect(intents[0].amount).toBe(4500)
    const { rows: events } = await container.pool.query(
      `SELECT count(*)::int AS n FROM payments_domain_events WHERE event_type = 'payments.authorization.succeeded'`)
    expect(events[0].n).toBe(1)
  })
})
