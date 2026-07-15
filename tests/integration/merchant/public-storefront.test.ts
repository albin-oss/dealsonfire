/**
 * Public storefront read (UX-IGNITE Phase 3) over real HTTP + embedded PG. The world sees
 * LIVE stores only; draft/held/unknown/malformed handles are indistinguishable 404s (no
 * enumeration). Brand + active products ride along; drafts stay backstage. Unauthenticated.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function merchantWithStore(opts: { publish: boolean }): Promise<{ cookie: string; businessId: string; storeId: string; handle: string }> {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `p-${uuidv7()}@example.com`, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle } })
  await http.request('PUT', `/api/v1/stores/${store.body.store_id}/brand-kit`, {
    headers: { cookie },
    body: { name: 'Rosa Knits', palette: { primary: '#7c3aed', surface: '#faf7ff', text: '#1c1917' }, voice: { tone: 'Soft things, made slowly.' } },
  })
  if (opts.publish) {
    // publishability needs a product on the shelf
    await http.request('POST', '/api/v1/products', {
      headers: { cookie },
      body: { business_id: biz.body.business_id, title: 'Lavender blanket', fulfillment_kind: 'physical', default_price: { amount: 4500, currency: 'EUR' }, publish_to_store_id: store.body.store_id },
    })
    const pub = await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
    expect(pub.status).toBe(200)
  }
  return { cookie, businessId: biz.body.business_id, storeId: store.body.store_id, handle }
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('GET /api/v1/public/stores/:handle', () => {
  it('serves a LIVE store to the world — name, brand, active products — with no auth', async () => {
    const { handle } = await merchantWithStore({ publish: true })
    const res = await http.request('GET', `/api/v1/public/stores/${handle}`)
    expect(res.status).toBe(200)
    expect(res.body.store).toMatchObject({ handle, name: 'Rosa Knits' })
    expect(res.body.store.published_at).not.toBeNull()
    expect(res.body.brand).toMatchObject({ name: 'Rosa Knits', tagline: 'Soft things, made slowly.' })
    expect(res.body.brand.palette.primary).toBe('#7c3aed')
    expect(res.body.products).toHaveLength(1)
    expect(res.body.products[0]).toMatchObject({ title: 'Lavender blanket', price_minor: 4500, currency: 'EUR' })
    expect(res.headers.get('cache-control')).toContain('public')
  })

  it('a DRAFT store answers 404 — indistinguishable from unknown (no enumeration)', async () => {
    const { handle } = await merchantWithStore({ publish: false })
    const draft = await http.request('GET', `/api/v1/public/stores/${handle}`)
    const unknown = await http.request('GET', '/api/v1/public/stores/nobody-here')
    expect(draft.status).toBe(404)
    expect(unknown.status).toBe(404)
    expect(draft.body.code).toBe(unknown.body.code) // same problem shape, no oracle
  })

  it('a malformed handle is a 404 without touching the database', async () => {
    expect((await http.request('GET', '/api/v1/public/stores/__nope__')).status).toBe(404)
  })

  it('draft products stay backstage on a live store', async () => {
    const { cookie, businessId, handle } = await merchantWithStore({ publish: true })
    // a draft product (no default price → stays draft)
    await http.request('POST', '/api/v1/products', {
      headers: { cookie }, body: { business_id: businessId, title: 'Unfinished scarf', fulfillment_kind: 'physical' },
    })
    const res = await http.request('GET', `/api/v1/public/stores/${handle}`)
    expect(res.body.products.map((p: { title: string }) => p.title)).toEqual(['Lavender blanket'])
  })
})
