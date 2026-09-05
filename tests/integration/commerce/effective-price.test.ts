/**
 * EP-1 — one authoritative price. Attacked.
 *
 * The invariant (ADR-002 §8, D2-7): display and charge resolve the SAME rule — base →
 * active (window-checked) sale — so they can never disagree, and an expired or not-yet-
 * started sale is NEVER charged (the pre-EP-1 window-blind COALESCE bug). Two representations
 * (the TS resolver on the charge path, the SQL fragment on batch display) are proven
 * equivalent. Order history, refunds, the Stripe amount, fees and shipping remain the
 * untouched snapshot/downstream truths they already were.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'
import { resolveEffectivePrice, effectivePriceSql } from '@domains/commerce/pricing/effective-price'

let container: Container
let http: TestHttp

async function merchant() {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `c-${uuidv7()}@example.com`, password: 'a long passphrase' } })
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(reg.headers.get('set-cookie')!)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle } })
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
  return { cookie, businessId: biz.body.business_id as string, storeId: store.body.store_id as string, handle }
}
async function shelvedVariant(m: Awaited<ReturnType<typeof merchant>>, amount = 4500, currency = 'EUR', title = 'Lavender blanket') {
  const res = await http.request('POST', '/api/v1/products', {
    headers: { cookie: m.cookie },
    body: { business_id: m.businessId, title, fulfillment_kind: 'physical', default_price: { amount, currency }, publish_to_store_id: m.storeId },
  })
  const pub = await http.request('GET', `/api/v1/public/stores/${m.handle}/products/${res.body.product_id}`)
  return { productId: res.body.product_id as string, variantId: pub.body.product.variants[0].id as string }
}
const setSale = (variantId: string, amount: number, startOffset: string, endOffset: string) =>
  container.pool.query(
    `UPDATE product_variants SET sale_amount=$2, sale_starts_at=now()+$3::interval, sale_ends_at=now()+$4::interval WHERE id=$1`,
    [variantId, amount, startOffset, endOffset])
const visitorCookie = (h: Headers) => `dof_visitor=${/dof_visitor=([^;]+)/.exec(h.get('set-cookie') ?? '')![1]}`
async function buyAndReadCharge(variantId: string): Promise<number> {
  const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: variantId, quantity: 1 } })
  const cookie = visitorCookie(add.headers)
  const co = await http.request('POST', '/api/v1/public/checkout', {
    headers: { cookie }, body: { attempt_key: uuidv7(), cart_id: add.body.cart_id, contact: { name: 'J', email: 'j@x.com' }, delivery: { line1: 'A', city: 'B', postal_code: '1', country: 'BE' } } })
  expect(co.body.ok).toBe(true)
  const { rows } = await container.pool.query<{ unit_price_minor: number }>(`SELECT unit_price_minor::int FROM order_lines WHERE order_id=$1`, [co.body.order_id])
  return rows[0]!.unit_price_minor
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('EP-1 — the charge honors the sale window', () => {
  it('an ACTIVE sale is charged at the sale price', async () => {
    const m = await merchant(); const { variantId } = await shelvedVariant(m, 4500)
    await setSale(variantId, 3000, '-1 day', '+1 day')
    expect(await buyAndReadCharge(variantId)).toBe(3000)
  })
  it('an EXPIRED sale is NOT charged — base is charged (the pre-EP-1 bug, fixed)', async () => {
    const m = await merchant(); const { variantId } = await shelvedVariant(m, 4500)
    await setSale(variantId, 3000, '-10 days', '-1 day')
    expect(await buyAndReadCharge(variantId)).toBe(4500)
  })
  it('a FUTURE sale is NOT charged — base is charged', async () => {
    const m = await merchant(); const { variantId } = await shelvedVariant(m, 4500)
    await setSale(variantId, 3000, '+1 day', '+10 days')
    expect(await buyAndReadCharge(variantId)).toBe(4500)
  })
  it('no sale → base is charged', async () => {
    const m = await merchant(); const { variantId } = await shelvedVariant(m, 4500)
    expect(await buyAndReadCharge(variantId)).toBe(4500)
  })
})

describe('EP-1 — display and charge agree', () => {
  it('the storefront “from” price reflects an active sale (was base-only pre-EP-1)', async () => {
    const m = await merchant(); const { variantId } = await shelvedVariant(m, 4500)
    await setSale(variantId, 3000, '-1 day', '+1 day')
    const shelf = await http.request('GET', `/api/v1/public/stores/${m.handle}`)
    const card = shelf.body.products.find((p: { id: string }) => p.id)
    expect(card.price_minor).toBe(3000) // shelf min is now sale-aware
    // and the same variant charges the same 3000 (display == charge)
    expect(await buyAndReadCharge(variantId)).toBe(3000)
  })
  it('an expired sale shows AND charges base everywhere', async () => {
    const m = await merchant(); const { variantId } = await shelvedVariant(m, 4500)
    await setSale(variantId, 3000, '-10 days', '-1 day')
    const shelf = await http.request('GET', `/api/v1/public/stores/${m.handle}`)
    expect(shelf.body.products[0].price_minor).toBe(4500)
    expect(await buyAndReadCharge(variantId)).toBe(4500)
  })
})

describe('EP-1 — money integrity', () => {
  it('the order snapshots the charged price; a later base change does not rewrite it', async () => {
    const m = await merchant(); const { productId, variantId } = await shelvedVariant(m, 4500)
    const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: variantId, quantity: 1 } })
    const cookie = visitorCookie(add.headers)
    const co = await http.request('POST', '/api/v1/public/checkout', {
      headers: { cookie }, body: { attempt_key: uuidv7(), cart_id: add.body.cart_id, contact: { name: 'J', email: 'j@x.com' }, delivery: { line1: 'A', city: 'B', postal_code: '1', country: 'BE' } } })
    // merchant changes the base price AFTER the order
    await container.pool.query(`UPDATE product_variants SET price_amount=9900 WHERE id=$1`, [variantId])
    const { rows } = await container.pool.query<{ unit_price_minor: number }>(`SELECT unit_price_minor::int FROM order_lines WHERE order_id=$1`, [co.body.order_id])
    expect(rows[0]!.unit_price_minor).toBe(4500) // history is stable
    void productId
  })
  it('a cart mixing currencies is refused at checkout (single-currency law)', async () => {
    const m = await merchant()
    const eur = await shelvedVariant(m, 4500, 'EUR', 'Euro thing')
    const usd = await shelvedVariant(m, 5000, 'USD', 'Dollar thing')
    const add1 = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: eur.variantId, quantity: 1 } })
    const cookie = visitorCookie(add1.headers)
    await http.request('POST', '/api/v1/public/cart/lines', { headers: { cookie }, body: { variant_id: usd.variantId, quantity: 1 } })
    const co = await http.request('POST', '/api/v1/public/checkout', {
      headers: { cookie }, body: { attempt_key: uuidv7(), cart_id: add1.body.cart_id, contact: { name: 'J', email: 'j@x.com' }, delivery: { line1: 'A', city: 'B', postal_code: '1', country: 'BE' } } })
    expect(co.body.ok).toBe(false) // mixed currency cannot be charged
  })
})

describe('EP-1 — drift guard: the TS resolver and the SQL fragment agree', () => {
  it('agree across the window matrix at a fixed instant', async () => {
    const m = await merchant(); const { variantId } = await shelvedVariant(m, 4500)
    const at = new Date()
    const atIso = at.toISOString()
    const cases: Array<{ label: string; sale: number | null; start: string; end: string }> = [
      { label: 'no sale', sale: null, start: '', end: '' },
      { label: 'active', sale: 3000, start: '-1 day', end: '+1 day' },
      { label: 'expired', sale: 3000, start: '-10 days', end: '-1 day' },
      { label: 'future', sale: 3000, start: '+1 day', end: '+10 days' },
    ]
    for (const c of cases) {
      if (c.sale === null) {
        await container.pool.query(`UPDATE product_variants SET sale_amount=NULL, sale_starts_at=NULL, sale_ends_at=NULL WHERE id=$1`, [variantId])
      } else {
        await setSale(variantId, c.sale, c.start, c.end)
      }
      // SQL side: the canonical fragment evaluated at the fixed instant
      const { rows } = await container.pool.query<{ base: number; sale: number | null; starts: Date | null; ends: Date | null; eff: number }>(
        `SELECT price_amount::int AS base, sale_amount::int AS sale, sale_starts_at AS starts, sale_ends_at AS ends,
                ${effectivePriceSql('v', '$2::timestamptz')}::int AS eff
         FROM product_variants v WHERE v.id=$1`, [variantId, atIso])
      const r = rows[0]!
      // TS side: the resolver on the same inputs + instant
      const ts = resolveEffectivePrice({
        baseUnitAmount: r.base, currency: 'EUR',
        sale: r.sale != null && r.starts && r.ends ? { amount: r.sale, startsAt: r.starts, endsAt: r.ends } : null,
        at,
      }).effectiveUnitAmount
      expect(ts, `${c.label}: TS`).toBe(r.eff)
    }
  })
})
