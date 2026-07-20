/**
 * Sparks (Release 0.6 — the content layer) over real HTTP + embedded PG. Publish (with
 * photo + product pointer) → the storefront strip and public spark page carry it → a
 * visitor fires it (the Release-0.4 toggle discipline, generalized) → the product card
 * drops when the product hides while THE SPARK SURVIVES → take-down masks it → events
 * and audits land with guest actors.
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
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `s-${uuidv7()}@example.com`, password: 'a long passphrase' } })
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

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('the spark loop (Release 0.6)', () => {
  it('publish with photo + product → storefront strip + public page → fire → take down → 404', async () => {
    const m = await merchant()
    // a registered photo (the Media Port's registry half)
    const mediaId = uuidv7()
    await container.pool.query(
      `INSERT INTO media_assets (id, business_id, url, content_type, size_bytes, created_by)
       VALUES ($1, $2, 'https://sandbox.media.local/needles.webp', 'image/webp', 1024, $3)`,
      [mediaId, m.businessId, uuidv7()])

    const created = await http.request('POST', '/api/v1/sparks', {
      headers: { cookie: m.cookie },
      body: { business_id: m.businessId, store_id: m.storeId, body: 'Fresh batch coming off the needles this week — three left from the last one.', media_id: mediaId, product_id: m.productId },
    })
    expect(created.status).toBe(201)
    const sparkId = created.body.spark_id as string

    // the storefront carries the strip
    const front = await http.request('GET', `/api/v1/public/stores/${m.handle}`)
    expect(front.body.sparks).toHaveLength(1)
    expect(front.body.sparks[0]).toMatchObject({ id: sparkId, image_url: 'https://sandbox.media.local/needles.webp' })

    // the public spark page: body, photo, product card, cacheable
    const page = await http.request('GET', `/api/v1/public/stores/${m.handle}/sparks/${sparkId}`)
    expect(page.status).toBe(200)
    expect(page.body.spark.body).toContain('off the needles')
    expect(page.body.product).toMatchObject({ title: 'Lavender blanket', price_minor: 4500 })
    expect(page.headers.get('cache-control')).toContain('public')

    // a visitor fires it — the generalized toggle discipline
    const fire = await http.request('POST', `/api/v1/public/sparks/${sparkId}/react`)
    expect(fire.body).toEqual({ active: true, count: 1 })
    const visitor = `dof_visitor=${/dof_visitor=([^;]+)/.exec(fire.headers.get('set-cookie') ?? '')![1]}`
    const unfire = await http.request('POST', `/api/v1/public/sparks/${sparkId}/react`, { headers: { cookie: visitor } })
    expect(unfire.body).toEqual({ active: false, count: 0 })

    // the merchant timeline shows it with counts
    const timeline = await http.request('GET', `/api/v1/sparks?business_id=${m.businessId}`, { headers: { cookie: m.cookie } })
    expect(timeline.body.items[0]).toMatchObject({ id: sparkId, fires: 0 })

    // take down → the same 404 as never-existed; reacting is dead too
    await http.request('POST', `/api/v1/sparks/${sparkId}/delete`, { headers: { cookie: m.cookie }, body: { business_id: m.businessId } })
    const gone = await http.request('GET', `/api/v1/public/stores/${m.handle}/sparks/${sparkId}`)
    const unknown = await http.request('GET', `/api/v1/public/stores/${m.handle}/sparks/${uuidv7()}`)
    expect(gone.status).toBe(404)
    expect(gone.body.code).toBe(unknown.body.code)
    expect((await http.request('POST', `/api/v1/public/sparks/${sparkId}/react`)).status).toBe(404)
  })

  it('the spark survives its product hiding — the card drops, the words stay', async () => {
    const m = await merchant()
    const created = await http.request('POST', '/api/v1/sparks', {
      headers: { cookie: m.cookie },
      body: { business_id: m.businessId, store_id: m.storeId, body: 'This blanket has a story.', product_id: m.productId },
    })
    const sparkId = created.body.spark_id

    await http.request('POST', `/api/v1/products/${m.productId}/unpublish-from-store`, {
      headers: { cookie: m.cookie }, body: { store_id: m.storeId },
    })
    const page = await http.request('GET', `/api/v1/public/stores/${m.handle}/sparks/${sparkId}`)
    expect(page.status).toBe(200) // the spark lives
    expect(page.body.product).toBeNull() // the card is gone
  })

  it('a spark cannot point at something the world cannot see; photos must be yours', async () => {
    const m = await merchant()
    const backstage = await http.request('POST', '/api/v1/products', {
      headers: { cookie: m.cookie },
      body: { business_id: m.businessId, title: 'Backstage scarf', fulfillment_kind: 'physical', default_price: { amount: 2000, currency: 'EUR' } },
    })
    const denied = await http.request('POST', '/api/v1/sparks', {
      headers: { cookie: m.cookie },
      body: { business_id: m.businessId, store_id: m.storeId, body: 'Sneak peek', product_id: backstage.body.product_id },
    })
    expect(denied.status).toBe(409)

    const foreignMedia = await http.request('POST', '/api/v1/sparks', {
      headers: { cookie: m.cookie },
      body: { business_id: m.businessId, store_id: m.storeId, body: 'Nice photo', media_id: uuidv7() },
    })
    expect(foreignMedia.status).toBe(422)
  })

  it('publish/delete/react are evented (guest actors on reactions) + audited; dispatcher drains clean', async () => {
    const m = await merchant()
    const created = await http.request('POST', '/api/v1/sparks', {
      headers: { cookie: m.cookie },
      body: { business_id: m.businessId, store_id: m.storeId, body: 'Hello, world of wool.' },
    })
    const sparkId = created.body.spark_id
    await http.request('POST', `/api/v1/public/sparks/${sparkId}/react`)
    await http.request('POST', `/api/v1/sparks/${sparkId}/delete`, { headers: { cookie: m.cookie }, body: { business_id: m.businessId } })

    const { rows: events } = await container.pool.query(
      `SELECT event_type, actor->>'type' AS actor_type FROM commerce_domain_events WHERE event_type LIKE 'commerce.spark.%' ORDER BY occurred_at`)
    expect(events.map((e) => e.event_type)).toEqual(['commerce.spark.published', 'commerce.spark.reacted', 'commerce.spark.deleted'])
    expect(events[1]!.actor_type).toBe('guest')
    const { rows: audits } = await container.pool.query(
      `SELECT command FROM commerce_audit_logs WHERE command LIKE 'commerce.spark.%'`)
    expect(audits).toHaveLength(3)
    expect((await container.commerce.dispatcher.dispatchPending()).failed).toBe(0)
  })

  it('tenant probes are masked on publish, timeline, and take-down', async () => {
    const alice = await merchant()
    const mallory = await merchant()
    const spark = await http.request('POST', '/api/v1/sparks', {
      headers: { cookie: alice.cookie },
      body: { business_id: alice.businessId, store_id: alice.storeId, body: 'Mine.' },
    })
    expect((await http.request('POST', '/api/v1/sparks', {
      headers: { cookie: mallory.cookie },
      body: { business_id: alice.businessId, store_id: alice.storeId, body: 'Not mine.' },
    })).status).toBe(404)
    expect((await http.request('GET', `/api/v1/sparks?business_id=${alice.businessId}`, { headers: { cookie: mallory.cookie } })).status).toBe(404)
    expect((await http.request('POST', `/api/v1/sparks/${spark.body.spark_id}/delete`, {
      headers: { cookie: mallory.cookie }, body: { business_id: alice.businessId },
    })).status).toBe(404)
  })
})
