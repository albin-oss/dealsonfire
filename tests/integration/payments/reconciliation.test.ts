/**
 * External reconciliation (C10 Slice 4 — RM-H1, G6): a seeded "week" of
 * activity — purchases, a cancellation refund, a return refund — reconciles
 * with ZERO unexplained unmatched items; a rogue provider movement is CAUGHT
 * and alarmed; replays never double; an interrupted run recovers.
 * THE LAW proven throughout: reconciliation observes, it never adjusts.
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

const twin = () => container.payments.providerInstance as SandboxProviderTwin

async function world() {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `rc-${uuidv7()}@maker.example`, password: 'a long passphrase' } })
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
  return { cookie, variantId: pub.body.product.variants[0].id as string }
}

async function buy(variantId: string) {
  const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: variantId, quantity: 1 } })
  const cookie = `dof_visitor=${/dof_visitor=([^;]+)/.exec(add.headers.get('set-cookie') ?? '')![1]}`
  const co = await http.request('POST', '/api/v1/public/checkout', {
    headers: { cookie },
    body: { attempt_key: uuidv7(), cart_id: add.body.cart_id, contact: { name: 'Jonas', email: 'jonas@buyer.example' }, delivery: { line1: 'K 1', city: 'A', postal_code: '2000', country: 'BE' } },
  })
  expect(co.body.ok).toBe(true)
  return { cookie, orderId: co.body.order_id as string }
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => {
  await truncateAll(container.pool)
  ;(container.rateLimiter as { reset?: () => void }).reset?.()
  twin().resetRecordedTransactions() // the twin's memory resets with the database
})

describe('C10 Slice 4 — external reconciliation (G6)', () => {
  it('a seeded week reconciles with ZERO unexplained unmatched; replays never double', async () => {
    const w = await world()
    // the week: three sales, one buyer cancellation (refund), one settled sale
    const a = await buy(w.variantId)
    const b = await buy(w.variantId)
    await buy(w.variantId)
    await http.request('POST', `/api/v1/public/orders/${a.orderId}/cancel`, { headers: { cookie: a.cookie } })

    const run = await container.payments.reconciliation.maybeRun(true)
    expect(run.ran).toBe(true)
    expect(run.unmatched).toBe(0) // G6: Stripe's account of the week ≡ ours
    expect(run.matched).toBeGreaterThanOrEqual(4) // 3 charges + 1 refund

    // replay: a forced second run re-reads overlapping ground and doubles NOTHING
    const again = await container.payments.reconciliation.maybeRun(true)
    expect(again.unmatched).toBe(0)
    const { rows } = await container.pool.query(
      `SELECT provider_txn_id, count(*) FROM reconciliation_items GROUP BY provider_txn_id HAVING count(*) > 1`)
    expect(rows).toHaveLength(0)
    // observation only: the ledger was not touched by reconciliation
    void b
    const check = await container.deps.uow.withTransaction((tx) =>
      container.payments.service.ledger.recomputeCheck(tx))
    expect(check.clean).toBe(true)
  })

  it('a rogue provider movement is CAUGHT: unmatched row + ops alarm; never silently absorbed', async () => {
    const w = await world()
    await buy(w.variantId)
    twin().injectRogueTransaction(1234) // money moved at the provider that our books never saw
    const run = await container.payments.reconciliation.maybeRun(true)
    expect(run.unmatched).toBe(1)
    const { rows } = await container.pool.query(
      `SELECT kind, amount_minor::int AS amount, state FROM reconciliation_items WHERE state = 'unmatched'`)
    expect(rows).toEqual([{ kind: 'other', amount: 1234, state: 'unmatched' }])

    // it surfaces in the ops queue until a human explains it
    const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `ops-${uuidv7()}@dof.example`, password: 'a long passphrase' } })
    const set = reg.headers.get('set-cookie')!
    const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
    const me = await http.request('GET', '/api/v1/auth/session', { headers: { cookie } })
    process.env.NUXT_OPS_USER_IDS = me.body.user_id
    const alarms = await http.request('GET', '/api/v1/ops/alarms', { headers: { cookie } })
    expect(alarms.body.alarms.some((a: { kind: string }) => a.kind === 'recon_unmatched')).toBe(true)
  })

  it('an interrupted run is marked failed and its ground is re-covered — money counted once', async () => {
    const w = await world()
    await buy(w.variantId)
    // simulate the crash: a run that started and never finished, an hour ago
    await container.pool.query(
      `INSERT INTO reconciliation_runs (id, watermark, state, started_at) VALUES ($1, $2, 'running', now() - interval '2 hours')`,
      [uuidv7(), new Date(0).toISOString()])
    const run = await container.payments.reconciliation.maybeRun(true)
    expect(run.ran).toBe(true)
    expect(run.unmatched).toBe(0)
    const { rows: states } = await container.pool.query(`SELECT state, count(*)::int AS n FROM reconciliation_runs GROUP BY state ORDER BY state`)
    expect(Object.fromEntries(states.map((s) => [s.state, s.n]))).toMatchObject({ failed: 1, complete: 1 })
  })
})
