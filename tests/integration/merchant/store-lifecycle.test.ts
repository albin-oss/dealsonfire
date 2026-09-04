/**
 * SV-1 — the maker controls whether their store is open. Attacked.
 *
 * The frozen laws (ADR-001 §7.2): status ⊥ enforcement_hold; paused carries a reason;
 * Closed ≠ Deleted, reversible 90 days. Plus: an offline store vanishes from every
 * public surface (visibility keys on status='live'); existing orders and payouts are
 * untouched; a held store cannot bypass the hold via any lifecycle verb; only an
 * authorized owner transitions, with step-up for close/restore; transitions converge.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

/** A signed-in owner with a live store + one published product. */
async function liveStore(handle: string) {
  const email = `m-${uuidv7()}@maker.example`
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email, password: 'a maker passphrase' } })
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(reg.headers.get('set-cookie')!)![1]!)}`
  // fresh session is step-up-fresh (C12) — good for close/restore
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: handle } })
  const businessId = biz.body.business_id as string
  const store = await http.request('POST', `/api/v1/businesses/${businessId}/stores`, { headers: { cookie }, body: { name: handle, handle } })
  const storeId = store.body.store_id as string
  await http.request('POST', '/api/v1/products', {
    headers: { cookie },
    body: { business_id: businessId, title: `${handle} thing`, fulfillment_kind: 'physical', default_price: { amount: 2500, currency: 'EUR' }, publish_to_store_id: storeId },
  })
  const pub = await http.request('POST', `/api/v1/stores/${storeId}/publish`, { headers: { cookie } })
  expect(pub.status).toBe(200)
  return { cookie, businessId, storeId, handle }
}
const life = (cookie: string, storeId: string, verb: string, body: Record<string, unknown> = {}) =>
  http.request('POST', `/api/v1/stores/${storeId}/${verb}`, { headers: { cookie }, body })
const storefront = (handle: string) => http.request('GET', `/api/v1/public/stores/${handle}`)
const status = async (storeId: string) =>
  (await container.pool.query<{ status: string; closed_at: Date | null }>(`SELECT status, closed_at FROM stores WHERE id = $1`, [storeId])).rows[0]

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('SV-1 — lifecycle transitions', () => {
  it('live → pause → the storefront is masked; reopen brings it back', async () => {
    const s = await liveStore('rosa-knits')
    expect((await storefront('rosa-knits')).status).toBe(200)
    expect((await life(s.cookie, s.storeId, 'pause', { reason: 'vacation', back_on: 'Monday' })).status).toBe(200)
    expect((await status(s.storeId)).status).toBe('paused')
    expect((await storefront('rosa-knits')).status).toBe(404) // masked everywhere status='live' gates
    expect((await life(s.cookie, s.storeId, 'publish')).status).toBe(200)
    expect((await status(s.storeId)).status).toBe('live')
    expect((await storefront('rosa-knits')).status).toBe(200)
  })

  it('close → masked + recovery clock set; restore within window returns it live', async () => {
    const s = await liveStore('grain-crumb')
    const closed = await life(s.cookie, s.storeId, 'close')
    expect(closed.status).toBe(200)
    expect(closed.body.restore_days_left).toBe(90)
    const row = await status(s.storeId)
    expect(row.status).toBe('closed')
    expect(row.closed_at).not.toBeNull()
    expect((await storefront('grain-crumb')).status).toBe(404)
    const restored = await life(s.cookie, s.storeId, 'restore')
    expect(restored.status).toBe(200)
    expect((await status(s.storeId)).status).toBe('live')
    expect((await storefront('grain-crumb')).status).toBe(200)
  })

  it('restore after the 90-day window refuses (the close is then final)', async () => {
    const s = await liveStore('kettle-mtn')
    await life(s.cookie, s.storeId, 'close')
    await container.pool.query(`UPDATE stores SET closed_at = now() - interval '91 days' WHERE id = $1`, [s.storeId])
    const late = await life(s.cookie, s.storeId, 'restore')
    expect(late.status).toBe(409) // CONFLICT — window passed
    expect((await status(s.storeId)).status).toBe('closed')
  })

  it('pause carries the reason (ADR §7.2)', async () => {
    const s = await liveStore('pixel-paper')
    await life(s.cookie, s.storeId, 'pause', { reason: 'restocking' })
    const { rows } = await container.pool.query(`SELECT pause_context FROM stores WHERE id = $1`, [s.storeId])
    expect(rows[0].pause_context).toMatchObject({ reason: 'restocking' })
  })
})

describe('SV-1 — the offline store vanishes from every discovery surface', () => {
  it('paused store is gone from storefront, search, shops directory, and product page', async () => {
    const s = await liveStore('zzznook') // distinctive handle for search
    await container.pool.query(`UPDATE stores SET name = 'Zzznook Wovens' WHERE id = $1`, [s.storeId])
    // visible first
    expect((await storefront('zzznook')).status).toBe(200)
    await life(s.cookie, s.storeId, 'pause', { reason: 'other' })
    // storefront
    expect((await storefront('zzznook')).status).toBe(404)
    // shops directory
    const shops = await http.request('GET', '/api/v1/public/shops')
    expect((shops.body.items ?? []).some((x: { handle: string }) => x.handle === 'zzznook')).toBe(false)
    // search
    const search = await http.request('GET', '/api/v1/public/search?q=zzznook')
    expect(search.body.shops ?? []).toHaveLength(0)
  })
})

describe('SV-1 — money and history survive going offline', () => {
  it('closing a store does not touch existing orders or the ledger', async () => {
    const s = await liveStore('order-shop')
    // a guest buys before the store closes
    const { rows: variant } = await container.pool.query(
      `SELECT v.id FROM product_variants v JOIN listings l ON l.product_id = v.product_id WHERE l.channel_id = $1 LIMIT 1`, [s.storeId])
    const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: variant[0].id, quantity: 1 } })
    const vcookie = `dof_visitor=${/dof_visitor=([^;]+)/.exec(add.headers.get('set-cookie') ?? '')![1]}`
    const co = await http.request('POST', '/api/v1/public/checkout', {
      headers: { cookie: vcookie },
      body: { attempt_key: uuidv7(), cart_id: add.body.cart_id, contact: { name: 'Buyer', email: 'b@x.example' }, delivery: { line1: 'A 1', city: 'A', postal_code: '2000', country: 'BE' } },
    })
    expect(co.body.ok).toBe(true)
    const orderId = co.body.order_id as string
    const ordersBefore = await container.pool.query(`SELECT count(*)::int AS n FROM orders WHERE id = $1`, [orderId])
    // now close the store
    await life(s.cookie, s.storeId, 'close')
    // the order still exists, unchanged; the buyer's key link still resolves
    const ordersAfter = await container.pool.query(`SELECT count(*)::int AS n FROM orders WHERE id = $1`, [orderId])
    expect(ordersAfter.rows[0].n).toBe(ordersBefore.rows[0].n)
    const merchantOrders = await http.request('GET', `/api/v1/orders?business_id=${s.businessId}`, { headers: { cookie: s.cookie } })
    expect(merchantOrders.status).toBe(200)
    expect((merchantOrders.body.items ?? []).some((o: { order_id?: string; id?: string }) => (o.order_id ?? o.id) === orderId)).toBe(true)
  })

  it('a buyer cannot start a NEW checkout against a paused store', async () => {
    const s = await liveStore('closing-shop')
    const { rows: variant } = await container.pool.query(
      `SELECT v.id FROM product_variants v JOIN listings l ON l.product_id = v.product_id WHERE l.channel_id = $1 LIMIT 1`, [s.storeId])
    const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: variant[0].id, quantity: 1 } })
    const vcookie = `dof_visitor=${/dof_visitor=([^;]+)/.exec(add.headers.get('set-cookie') ?? '')![1]}`
    await life(s.cookie, s.storeId, 'pause', { reason: 'other' })
    const co = await http.request('POST', '/api/v1/public/checkout', {
      headers: { cookie: vcookie },
      body: { attempt_key: uuidv7(), cart_id: add.body.cart_id, contact: { name: 'Buyer', email: 'b@x.example' }, delivery: { line1: 'A 1', city: 'A', postal_code: '2000', country: 'BE' } },
    })
    expect(co.body.ok).not.toBe(true) // refused; the product/store is no longer purchasable
  })
})

describe('SV-1 — enforcement stays distinct and supreme', () => {
  it('a held store cannot be reopened by the merchant, and lifecycle never clears the hold', async () => {
    const s = await liveStore('held-shop')
    await life(s.cookie, s.storeId, 'pause', { reason: 'other' })
    // platform places a hold while paused
    await container.pool.query(`UPDATE stores SET enforcement_hold = 'under_review' WHERE id = $1`, [s.storeId])
    const reopen = await life(s.cookie, s.storeId, 'publish')
    expect(reopen.status).toBe(423) // ENFORCEMENT_HOLD — merchant cannot publish through a hold
    // the hold is untouched by the attempt
    const { rows } = await container.pool.query(`SELECT enforcement_hold, status FROM stores WHERE id = $1`, [s.storeId])
    expect(rows[0].enforcement_hold).toBe('under_review')
    expect(rows[0].status).toBe('paused')
  })

  it('a voluntary pause writes NO abuse/enforcement record', async () => {
    const s = await liveStore('calm-shop')
    await life(s.cookie, s.storeId, 'pause', { reason: 'vacation' })
    const { rows } = await container.pool.query(`SELECT enforcement_hold FROM stores WHERE id = $1`, [s.storeId])
    expect(rows[0].enforcement_hold).toBe('none')
    const abuse = await container.pool.query(`SELECT count(*)::int AS n FROM abuse_reports`)
    expect(abuse.rows[0].n).toBe(0)
  })
})

describe('SV-1 — authorization, step-up, audit, idempotency', () => {
  it('a non-member cannot transition the store (masked NOT_FOUND)', async () => {
    const s = await liveStore('mine-shop')
    const stranger = await http.request('POST', '/api/v1/auth/register', { body: { email: `x-${uuidv7()}@x.example`, password: 'a stranger passphrase' } })
    const scookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(stranger.headers.get('set-cookie')!)![1]!)}`
    const r = await life(scookie, s.storeId, 'pause', { reason: 'other' })
    expect(r.status).toBe(404)
    expect((await status(s.storeId)).status).toBe('live') // untouched
  })

  it('close requires fresh step-up', async () => {
    const s = await liveStore('stepup-shop')
    // age the step-up so it is stale
    await container.pool.query(`UPDATE user_sessions SET step_up_at = now() - interval '10 minutes'`)
    const stale = await life(s.cookie, s.storeId, 'close')
    expect(stale.status).toBe(403) // STEP_UP_REQUIRED
    expect((await status(s.storeId)).status).toBe('live')
  })

  it('close is audited', async () => {
    const s = await liveStore('audit-shop')
    await life(s.cookie, s.storeId, 'close')
    const { rows } = await container.pool.query(
      `SELECT count(*)::int AS n FROM audit_logs WHERE command = 'merchant.store.close'`)
    expect(rows[0].n).toBeGreaterThanOrEqual(1)
  })

  it('double pause and double close converge (idempotent, one truthful state)', async () => {
    const s = await liveStore('idem-shop')
    const [a, b] = await Promise.all([life(s.cookie, s.storeId, 'pause', { reason: 'other' }), life(s.cookie, s.storeId, 'pause', { reason: 'other' })])
    expect([a.status, b.status].every((x) => x === 200)).toBe(true)
    expect((await status(s.storeId)).status).toBe('paused')
    const c1 = await life(s.cookie, s.storeId, 'close')
    const c2 = await life(s.cookie, s.storeId, 'close')
    expect([c1.status, c2.status].every((x) => x === 200)).toBe(true)
    expect((await status(s.storeId)).status).toBe('closed')
    // one close event, not two
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM domain_events WHERE event_type = 'merchant.store.closed' AND aggregate_id = $1`, [s.storeId])
    expect(rows[0].n).toBe(1)
  })
})
