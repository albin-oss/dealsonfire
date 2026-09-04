/**
 * SV-3 — the maker runs their store. The new operational seams, attacked.
 *
 * Inventory: the merchant read is catalog-driven (untracked variants surface); the adjust
 * command is the ONLY merchant write and turns tracking on; it can never set stock below
 * units held by in-progress checkouts, and it is authorized + audited. Returns: the merchant
 * queue projects the four-state machine across all states with minimum disclosure (no PII).
 * The existing reservation/refund/restock engine and the single 30-day law are unchanged.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function signIn(): Promise<string> {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `m-${uuidv7()}@maker.example`, password: 'a maker passphrase' } })
  return `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(reg.headers.get('set-cookie')!)![1]!)}`
}

/** A signed-in owner with a live store + one published product (one default variant). */
async function storeWithProduct(handle: string) {
  const cookie = await signIn()
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: handle } })
  const businessId = biz.body.business_id as string
  const store = await http.request('POST', `/api/v1/businesses/${businessId}/stores`, { headers: { cookie }, body: { name: handle, handle } })
  const storeId = store.body.store_id as string
  await http.request('POST', '/api/v1/products', {
    headers: { cookie },
    body: { business_id: businessId, title: `${handle} thing`, fulfillment_kind: 'physical', default_price: { amount: 2500, currency: 'EUR' }, publish_to_store_id: storeId },
  })
  await http.request('POST', `/api/v1/stores/${storeId}/publish`, { headers: { cookie } })
  const { rows } = await container.pool.query<{ id: string }>(`SELECT id FROM product_variants WHERE business_id = $1 LIMIT 1`, [businessId])
  return { cookie, businessId, storeId, handle, variantId: rows[0]!.id }
}

const inventory = (cookie: string, businessId: string) =>
  http.request('GET', `/api/v1/inventory?business_id=${businessId}`, { headers: { cookie } })
const adjust = (cookie: string, variantId: string, body: Record<string, unknown>) =>
  http.request('POST', `/api/v1/inventory/${variantId}`, { headers: { cookie, 'idempotency-key': uuidv7() }, body })
const returnsList = (cookie: string, businessId: string) =>
  http.request('GET', `/api/v1/returns?business_id=${businessId}`, { headers: { cookie } })

const stockItem = async (variantId: string) =>
  (await container.pool.query<{ id: string; on_hand: number; tracking_mode: string }>(
    `SELECT id, on_hand, tracking_mode FROM stock_items WHERE variant_id = $1`, [variantId])).rows[0] ?? null

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('SV-3 — inventory', () => {
  it('lists variants; a fresh variant reads as untracked (always sellable), not zero', async () => {
    const s = await storeWithProduct('rosa-knits')
    const inv = await inventory(s.cookie, s.businessId)
    expect(inv.status).toBe(200)
    const row = inv.body.items.find((i: { variant_id: string }) => i.variant_id === s.variantId)
    expect(row).toBeTruthy()
    expect(row.tracked).toBe(false)
    expect(row.available).toBeNull() // untracked ≠ 0
  })

  it('a set-count turns tracking on and reports on-hand + available truthfully', async () => {
    const s = await storeWithProduct('grain-crumb')
    const res = await adjust(s.cookie, s.variantId, { business_id: s.businessId, mode: 'set', quantity: 12 })
    expect(res.status).toBe(200)
    expect(res.body.on_hand).toBe(12)
    expect(await stockItem(s.variantId)).toMatchObject({ on_hand: 12, tracking_mode: 'tracked' })
    const inv = await inventory(s.cookie, s.businessId)
    const row = inv.body.items.find((i: { variant_id: string }) => i.variant_id === s.variantId)
    expect(row).toMatchObject({ tracked: true, on_hand: 12, reserved: 0, available: 12 })
  })

  it('a ±delta adjusts from the current count', async () => {
    const s = await storeWithProduct('pixel-paper')
    await adjust(s.cookie, s.variantId, { business_id: s.businessId, mode: 'set', quantity: 10 })
    expect((await adjust(s.cookie, s.variantId, { business_id: s.businessId, mode: 'delta', quantity: -3 })).body.on_hand).toBe(7)
    expect((await adjust(s.cookie, s.variantId, { business_id: s.businessId, mode: 'delta', quantity: 5 })).body.on_hand).toBe(12)
  })

  it('an impossible (below zero) adjustment refuses', async () => {
    const s = await storeWithProduct('kettle-mtn')
    await adjust(s.cookie, s.variantId, { business_id: s.businessId, mode: 'set', quantity: 2 })
    expect((await adjust(s.cookie, s.variantId, { business_id: s.businessId, mode: 'delta', quantity: -5 })).status).toBe(409)
    expect((await stockItem(s.variantId))!.on_hand).toBe(2) // unchanged
  })

  it('cannot set stock below what in-progress checkouts already hold', async () => {
    const s = await storeWithProduct('held-stock')
    await adjust(s.cookie, s.variantId, { business_id: s.businessId, mode: 'set', quantity: 5 })
    const item = await stockItem(s.variantId)
    // simulate an in-flight checkout holding 3 units
    await container.pool.query(
      `INSERT INTO reservations (id, order_line_id, business_id, variant_id, stock_item_id, quantity, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, 3, 'active', now() + interval '10 minutes')`,
      [uuidv7(), uuidv7(), s.businessId, s.variantId, item!.id])
    expect((await adjust(s.cookie, s.variantId, { business_id: s.businessId, mode: 'set', quantity: 2 })).status).toBe(409)
    expect((await stockItem(s.variantId))!.on_hand).toBe(5) // guard held; nothing changed
    expect((await adjust(s.cookie, s.variantId, { business_id: s.businessId, mode: 'set', quantity: 3 })).status).toBe(200) // exactly the held floor is allowed
  })

  it('a non-member cannot read or adjust another business’s stock (masked)', async () => {
    const s = await storeWithProduct('mine-ops')
    const stranger = await signIn()
    expect((await inventory(stranger, s.businessId)).status).toBe(404)
    expect((await adjust(stranger, s.variantId, { business_id: s.businessId, mode: 'set', quantity: 99 })).status).toBe(404)
    expect(await stockItem(s.variantId)).toBeNull() // never created
  })

  it('a repeated identical set converges — no duplicate ledger entry', async () => {
    const s = await storeWithProduct('idem-stock')
    await adjust(s.cookie, s.variantId, { business_id: s.businessId, mode: 'set', quantity: 8 })
    await adjust(s.cookie, s.variantId, { business_id: s.businessId, mode: 'set', quantity: 8 }) // no-op (delta 0)
    const { rows } = await container.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM stock_ledger sl JOIN stock_items si ON si.id = sl.stock_item_id WHERE si.variant_id = $1`, [s.variantId])
    expect(rows[0]!.n).toBe(1) // one 'counted' row, not two
  })

  it('the adjustment is audited', async () => {
    const s = await storeWithProduct('audit-stock')
    await adjust(s.cookie, s.variantId, { business_id: s.businessId, mode: 'set', quantity: 4, note: 'opening count' })
    const { rows } = await container.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM operations_audit_logs WHERE command = 'operations.inventory.adjust'`)
    expect(rows[0]!.n).toBeGreaterThanOrEqual(1)
  })

  it('a tracked variant set to 1 sells exactly once (oversell law intact under the merchant number)', async () => {
    const s = await storeWithProduct('last-unit')
    await adjust(s.cookie, s.variantId, { business_id: s.businessId, mode: 'set', quantity: 1 })
    const item = await stockItem(s.variantId)
    const reserve = (line: string) => container.deps.uow.withTransaction((tx) =>
      container.operations.stock.reserveStock(tx, { orderLineId: line, businessId: s.businessId, variantId: s.variantId, quantity: 1 }))
    const a = await reserve(uuidv7()); const b = await reserve(uuidv7())
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(false) // the merchant's "1" is the real ceiling
    expect(item!.on_hand).toBe(1)
  })
})

describe('SV-3 — returns queue', () => {
  it('lists returns across all states, newest first, with no buyer PII', async () => {
    const s = await storeWithProduct('returns-shop')
    // seed two cases in different states directly (the decision engine is proven elsewhere)
    const mk = async (state: string, ago: string) => {
      const id = uuidv7()
      await container.pool.query(
        `INSERT INTO return_cases (id, order_id, store_id, business_id, state, reason_code, buyer_comment, created_at)
         VALUES ($1, $2, $3, $4, $5, 'damaged', 'the buyer PII comment', now() - $6::interval)`,
        [id, uuidv7(), s.storeId, s.businessId, state, ago])
      return id
    }
    await mk('resolved', '2 days')
    const openId = await mk('requested', '1 hour')
    const list = await returnsList(s.cookie, s.businessId)
    expect(list.status).toBe(200)
    expect(list.body.items.length).toBe(2)
    expect(list.body.items[0].id).toBe(openId) // newest first
    expect(list.body.items.map((i: { state: string }) => i.state).sort()).toEqual(['requested', 'resolved'])
    // minimum disclosure: no name/email/address/comment fields
    const keys = Object.keys(list.body.items[0])
    expect(keys).not.toContain('buyer_comment')
    expect(keys).not.toContain('buyer_name')
    expect(keys).not.toContain('delivery')
  })

  it('a non-member cannot read another business’s returns (masked)', async () => {
    const s = await storeWithProduct('mine-returns')
    const stranger = await signIn()
    expect((await returnsList(stranger, s.businessId)).status).toBe(404)
  })
})
