/**
 * ACCEPTANCE-001 regression suite (IMP-COM-001C) — the acceptance reviewer's black-box
 * probes, made permanent. Pure HTTP: no domain imports, no direct SQL except where a
 * probe verifies masking/immutability side effects. If a future change breaks the
 * merchant workflow these encode, this suite — not a human reviewer — catches it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const auth = (userId: string) => ({ 'x-dof-user-id': userId })

async function newMerchant() {
  const userId = uuidv7()
  const res = await http.request('POST', '/api/v1/businesses', {
    headers: auth(userId), body: { display_name: 'Grandma Soaps', business_type: 'individual' },
  })
  expect(res.status).toBe(201)
  return { userId, businessId: res.body.business_id as string }
}

async function createProduct(userId: string, businessId: string, overrides: Record<string, unknown> = {}) {
  return http.request('POST', '/api/v1/products', {
    headers: auth(userId),
    body: {
      business_id: businessId, title: 'Lavender Soap', fulfillment_kind: 'physical',
      default_price: { amount: 1500, currency: 'EUR' }, ...overrides,
    },
  })
}

beforeAll(async () => {
  container = newTestContainer()
  setContainer(container)
  http = await startTestApp()
})
afterAll(async () => {
  await http.close()
  setContainer(null)
  await container.shutdown()
})
beforeEach(() => truncateAll(container.pool))

describe('B2: the growth path — a simple product becomes a multi-variant product', () => {
  it('guides the merchant from one soap to a Scent axis without recreating the product', async () => {
    const { userId, businessId } = await newMerchant()
    const created = await createProduct(userId, businessId)
    expect(created.status).toBe(201)
    const productId = created.body.product_id as string
    expect(created.body.options).toEqual([])
    expect(created.body.variants).toHaveLength(1)

    // Naive second variant: not a bare rejection — the error teaches the next step.
    const naive = await http.request('POST', `/api/v1/products/${productId}/variants`, {
      headers: auth(userId), body: { price: { amount: 1600, currency: 'EUR' } },
    })
    expect(naive.status).toBe(409)
    expect(naive.body.code).toBe('CONFLICT')
    expect(naive.body.detail).toContain('This product currently has no options')
    expect(naive.body.detail).toContain('Add an option (for example Size or Color)')

    // Follow the guidance: declare Scent, keeping the existing soap as Lavender.
    const optioned = await http.request('POST', `/api/v1/products/${productId}/options`, {
      headers: auth(userId),
      body: { name: 'Scent', values: ['Lavender', 'Rose'], existing_variants_value: 'Lavender' },
    })
    expect(optioned.status).toBe(201)
    expect(optioned.body.options).toEqual([{ name: 'Scent', values: ['Lavender', 'Rose'] }])
    expect(optioned.body.variants[0].option_values).toEqual({ Scent: 'Lavender' })

    // Now the Rose variant lands.
    const rose = await http.request('POST', `/api/v1/products/${productId}/variants`, {
      headers: auth(userId), body: { price: { amount: 1600, currency: 'EUR' }, option_values: { Scent: 'Rose' } },
    })
    expect(rose.status).toBe(201)
    expect(rose.body.variants).toHaveLength(2)

    // Extend the axis both ways: PATCH add_values and POST /values.
    const patched = await http.request('PATCH', `/api/v1/products/${productId}/options/Scent`, {
      headers: auth(userId), body: { add_values: ['Vanilla'] },
    })
    expect(patched.status).toBe(200)
    expect(patched.body.options[0].values).toEqual(['Lavender', 'Rose', 'Vanilla'])
    const posted = await http.request('POST', `/api/v1/products/${productId}/options/Scent/values`, {
      headers: auth(userId), body: { values: ['Mint'] },
    })
    expect(posted.status).toBe(201)
    expect(posted.body.options[0].values).toContain('Mint')

    // Retire an unused value; a used value is protected (I5).
    const retired = await http.request('DELETE', `/api/v1/products/${productId}/options/Scent/values/Mint`, { headers: auth(userId) })
    expect(retired.status).toBe(200)
    expect(retired.body.options[0].values).not.toContain('Mint')
    const protectedValue = await http.request('DELETE', `/api/v1/products/${productId}/options/Scent/values/Rose`, { headers: auth(userId) })
    expect(protectedValue.status).toBe(409)
    expect(protectedValue.body.detail).toContain('used by existing variants')

    // Removing the axis would merge Lavender and Rose — the domain refuses to guess (I3).
    const collapse = await http.request('DELETE', `/api/v1/products/${productId}/options/Scent`, { headers: auth(userId) })
    expect(collapse.status).toBe(409)
    expect(collapse.body.detail).toContain('identical')

    // A second axis with a space in its name round-trips through the URL, then removes
    // cleanly because variants stay distinct on Scent.
    const second = await http.request('POST', `/api/v1/products/${productId}/options`, {
      headers: auth(userId),
      body: { name: 'Gift wrap', values: ['None', 'Ribbon'], existing_variants_value: 'None' },
    })
    expect(second.status).toBe(201)
    const removed = await http.request('DELETE', `/api/v1/products/${productId}/options/${encodeURIComponent('Gift wrap')}`, { headers: auth(userId) })
    expect(removed.status).toBe(200)
    expect(removed.body.options.map((o: { name: string }) => o.name)).toEqual(['Scent'])
  })

  it('addOption without assignments for existing variants explains both request shapes', async () => {
    const { userId, businessId } = await newMerchant()
    const created = await createProduct(userId, businessId)
    const productId = created.body.product_id as string
    const missing = await http.request('POST', `/api/v1/products/${productId}/options`, {
      headers: auth(userId), body: { name: 'Size', values: ['Small', 'Large'] },
    })
    expect(missing.status).toBe(422)
    expect(missing.body.detail).toContain('existing_variants_value')
    expect(missing.body.detail).toContain('variant_assignments')
  })
})

describe('B1: duplicate SKU across products is a merchant answer, not a server error', () => {
  it('create-time and add-variant-time collisions both return 409 SKU_TAKEN', async () => {
    const { userId, businessId } = await newMerchant()
    const first = await createProduct(userId, businessId, {
      variants: [{ sku: 'SOAP-001', price: { amount: 1500, currency: 'EUR' } }],
      default_price: undefined,
    })
    expect(first.status).toBe(201)

    // Same SKU on a NEW product (the acceptance probe that returned HTTP 500).
    const dupCreate = await createProduct(userId, businessId, {
      title: 'Rose Soap',
      variants: [{ sku: 'SOAP-001', price: { amount: 1600, currency: 'EUR' } }],
      default_price: undefined,
    })
    expect(dupCreate.status).toBe(409)
    expect(dupCreate.body.code).toBe('SKU_TAKEN')
    expect(dupCreate.body.detail).toContain('SOAP-001')
    expect(dupCreate.body.detail).toContain('leave it blank to auto-generate')

    // Same collision through addVariant on an optioned product.
    const optioned = await createProduct(userId, businessId, {
      title: 'Candle',
      options: [{ name: 'Size', values: ['S', 'M'] }],
      variants: [{ price: { amount: 900, currency: 'EUR' }, option_values: { Size: 'S' } }],
      default_price: undefined,
    })
    expect(optioned.status).toBe(201)
    const dupAdd = await http.request('POST', `/api/v1/products/${optioned.body.product_id}/variants`, {
      headers: auth(userId), body: { sku: 'SOAP-001', price: { amount: 950, currency: 'EUR' }, option_values: { Size: 'M' } },
    })
    expect(dupAdd.status).toBe(409)
    expect(dupAdd.body.code).toBe('SKU_TAKEN')

    // The failed create left nothing behind (transaction rolled back whole).
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM products WHERE title = 'Rose Soap'`)
    expect(rows[0].n).toBe(0)
  })
})

describe('working-set defaults, search, and educating validation (N1/N2/N4)', () => {
  it('the grid hides archived products unless asked; q filters by title', async () => {
    const { userId, businessId } = await newMerchant()
    const soap = await createProduct(userId, businessId, { title: 'Lavender Soap' })
    await createProduct(userId, businessId, { title: 'Beeswax Candle' })
    await http.request('POST', `/api/v1/products/${soap.body.product_id}/archive`, { headers: auth(userId) })

    const grid = await http.request('GET', `/api/v1/products?business_id=${businessId}`, { headers: auth(userId) })
    expect(grid.status).toBe(200)
    expect(grid.body.items.map((i: { title: string }) => i.title)).toEqual(['Beeswax Candle'])

    const all = await http.request('GET', `/api/v1/products?business_id=${businessId}&show_archived=true`, { headers: auth(userId) })
    expect(all.body.items).toHaveLength(2)

    const archivedOnly = await http.request('GET', `/api/v1/products?business_id=${businessId}&status=archived`, { headers: auth(userId) })
    expect(archivedOnly.body.items.map((i: { title: string }) => i.title)).toEqual(['Lavender Soap'])

    // q matches titles case-insensitively across statuses the view includes; wildcards are literal.
    const found = await http.request('GET', `/api/v1/products?business_id=${businessId}&q=candle`, { headers: auth(userId) })
    expect(found.body.items.map((i: { title: string }) => i.title)).toEqual(['Beeswax Candle'])
    const wildcard = await http.request('GET', `/api/v1/products?business_id=${businessId}&q=${encodeURIComponent('%')}`, { headers: auth(userId) })
    expect(wildcard.body.items).toHaveLength(0)
  })

  it('a decimal price explains minor units instead of muttering about integers', async () => {
    const { userId, businessId } = await newMerchant()
    const decimal = await createProduct(userId, businessId, { default_price: { amount: 14.99, currency: 'EUR' } })
    expect(decimal.status).toBe(422)
    const messages = JSON.stringify(decimal.body)
    expect(messages).toContain('integer minor units')
    expect(messages).toContain('1499')
  })

  it('media removal addresses the attachment id under its honest name (N3)', async () => {
    const { userId, businessId } = await newMerchant()
    const created = await createProduct(userId, businessId)
    const productId = created.body.product_id as string
    const attached = await http.request('POST', `/api/v1/products/${productId}/media`, {
      headers: auth(userId), body: { media_id: uuidv7() },
    })
    expect(attached.status).toBe(201)
    const productMediaId = attached.body.media[0].product_media_id as string
    const removed = await http.request('DELETE', `/api/v1/products/${productId}/media/${productMediaId}`, { headers: auth(userId) })
    expect(removed.status).toBe(200)
    expect(removed.body.media).toHaveLength(0)
  })
})

describe('option endpoints keep kernel laws (masking, archived read-only)', () => {
  it('cross-tenant option writes are masked as 404; archived products refuse option edits', async () => {
    const { userId, businessId } = await newMerchant()
    const created = await createProduct(userId, businessId)
    const productId = created.body.product_id as string

    const intruder = (await newMerchant()).userId
    const probes = [
      ['POST', `/api/v1/products/${productId}/options`, { name: 'Size', values: ['S'] }],
      ['PATCH', `/api/v1/products/${productId}/options/Size`, { add_values: ['M'] }],
      ['DELETE', `/api/v1/products/${productId}/options/Size`, undefined],
      ['POST', `/api/v1/products/${productId}/options/Size/values`, { values: ['M'] }],
      ['DELETE', `/api/v1/products/${productId}/options/Size/values/S`, undefined],
    ] as const
    for (const [method, path, body] of probes) {
      const res = await http.request(method, path, { headers: auth(intruder), ...(body ? { body } : {}) })
      expect(res.status, `${method} ${path}`).toBe(404)
    }

    await http.request('POST', `/api/v1/products/${productId}/archive`, { headers: auth(userId) })
    const frozen = await http.request('POST', `/api/v1/products/${productId}/options`, {
      headers: auth(userId), body: { name: 'Size', values: ['S'], existing_variants_value: 'S' },
    })
    expect(frozen.status).toBe(409)
    expect(frozen.body.code).toBe('INVALID_TRANSITION')
  })
})
