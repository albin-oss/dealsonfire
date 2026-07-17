/**
 * Merchant momentum facts (Release 0.8) over real HTTP + embedded PG: the progress
 * endpoint carries followers / hours_quiet / the unsparked product — computed purely
 * from existing tables, transitioning truthfully as the merchant publishes.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('publishing momentum (Release 0.8)', () => {
  it('progress carries the facts and they move with the merchant', async () => {
    const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `m-${uuidv7()}@example.com`, password: 'a long passphrase' } })
    const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(reg.headers.get('set-cookie')!)![1]!)}`

    // no business yet → momentum is null (nothing to speak from)
    const before = await http.request('GET', '/api/v1/workspace/progress', { headers: { cookie } })
    expect(before.body.momentum).toBeNull()

    const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
    const handle = `rosa-${uuidv7().slice(-6)}`
    const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle } })
    const product = await http.request('POST', '/api/v1/products', {
      headers: { cookie },
      body: { business_id: biz.body.business_id, title: 'Lavender blanket', fulfillment_kind: 'physical', default_price: { amount: 4500, currency: 'EUR' }, publish_to_store_id: store.body.store_id },
    })
    await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })

    // fresh store: no followers, never published, the blanket is unsparked
    const fresh = await http.request('GET', '/api/v1/workspace/progress', { headers: { cookie } })
    expect(fresh.body.momentum).toMatchObject({
      followers: 0, hours_quiet: null,
      unsparked_product: { id: product.body.product_id, title: 'Lavender blanket' },
    })

    // a visitor follows; the merchant sparks the blanket
    await http.request('POST', `/api/v1/public/stores/${handle}/follow`)
    await http.request('POST', '/api/v1/sparks', {
      headers: { cookie },
      body: { business_id: biz.body.business_id, store_id: store.body.store_id, body: 'Fresh off the needles.', product_id: product.body.product_id },
    })

    const after = await http.request('GET', '/api/v1/workspace/progress', { headers: { cookie } })
    expect(after.body.momentum.followers).toBe(1)
    expect(after.body.momentum.hours_quiet).toBe(0) // just published
    expect(after.body.momentum.unsparked_product).toBeNull() // the blanket had its moment

    // a second product joins the shelf → it becomes the next moment
    const scarf = await http.request('POST', '/api/v1/products', {
      headers: { cookie },
      body: { business_id: biz.body.business_id, title: 'Wool scarf', fulfillment_kind: 'physical', default_price: { amount: 2200, currency: 'EUR' }, publish_to_store_id: store.body.store_id },
    })
    const next = await http.request('GET', '/api/v1/workspace/progress', { headers: { cookie } })
    expect(next.body.momentum.unsparked_product).toMatchObject({ id: scarf.body.product_id, title: 'Wool scarf' })
  })
})
