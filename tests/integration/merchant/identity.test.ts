/**
 * Merchant Identity (Release 0.5) over real HTTP + embedded PG. The loop: GET the kit
 * (editor read, masked) → PUT voice with story + promise (the existing whole-value
 * Brand Kit write — no new write paths) → the identity flows to every public surface
 * (storefront, product page, deal page). Limits educate; probes are masked.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function merchant(): Promise<{ cookie: string; businessId: string; storeId: string; handle: string; productId: string }> {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `i-${uuidv7()}@example.com`, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle } })
  const product = await http.request('POST', '/api/v1/products', {
    headers: { cookie },
    body: { business_id: biz.body.business_id, title: 'Lavender blanket', fulfillment_kind: 'physical', default_price: { amount: 4500, currency: 'EUR' }, publish_to_store_id: store.body.store_id },
  })
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
  return { cookie, businessId: biz.body.business_id, storeId: store.body.store_id, handle, productId: product.body.product_id }
}

const VOICE = {
  tone: 'Soft things, made slowly.',
  story: 'Rosa Knits started at a kitchen table — one person who cared too much about blankets to do it halfway.',
  promise: 'If something isn’t right, we make it right — always.',
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('the identity loop (Release 0.5)', () => {
  it('GET kit → PUT voice → the story and promise appear on every public surface', async () => {
    const m = await merchant()

    // the editor's read: a store without a kit answers an empty, teachable one
    const blank = await http.request('GET', `/api/v1/stores/${m.storeId}/brand-kit`, { headers: { cookie: m.cookie } })
    expect(blank.status).toBe(200)
    expect(blank.body.voice).toEqual({})

    // the write is the existing whole-value PUT
    const put = await http.request('PUT', `/api/v1/stores/${m.storeId}/brand-kit`, {
      headers: { cookie: m.cookie },
      body: { name: 'Rosa Knits', palette: { primary: '#7c3aed' }, voice: VOICE },
    })
    expect(put.status).toBe(200)
    expect(put.body.voice).toMatchObject(VOICE)

    // …and it round-trips through the editor read
    const read = await http.request('GET', `/api/v1/stores/${m.storeId}/brand-kit`, { headers: { cookie: m.cookie } })
    expect(read.body.voice).toMatchObject(VOICE)

    // the identity flows to all three public surfaces
    const front = await http.request('GET', `/api/v1/public/stores/${m.handle}`)
    expect(front.body.brand).toMatchObject({ tagline: VOICE.tone, story: VOICE.story, promise: VOICE.promise })

    const product = await http.request('GET', `/api/v1/public/stores/${m.handle}/products/${m.productId}`)
    expect(product.body.brand.promise).toBe(VOICE.promise)

    const deal = await http.request('POST', '/api/v1/deals', {
      headers: { cookie: m.cookie },
      body: { product_id: m.productId, store_id: m.storeId, headline: 'Weekend special' },
    })
    const dealPage = await http.request('GET', `/api/v1/public/stores/${m.handle}/deals/${deal.body.deal_id}`)
    expect(dealPage.body.brand.promise).toBe(VOICE.promise)
  })

  it('limits educate: an over-long story is refused at the contract edge', async () => {
    const m = await merchant()
    const res = await http.request('PUT', `/api/v1/stores/${m.storeId}/brand-kit`, {
      headers: { cookie: m.cookie },
      body: { name: 'Rosa Knits', voice: { story: 'x'.repeat(501) } },
    })
    expect(res.status).toBe(422)
  })

  it('the editor read is masked: another merchant probing my kit sees store-not-found', async () => {
    const alice = await merchant()
    const mallory = await merchant()
    const probe = await http.request('GET', `/api/v1/stores/${alice.storeId}/brand-kit`, { headers: { cookie: mallory.cookie } })
    expect(probe.status).toBe(404)
  })
})
