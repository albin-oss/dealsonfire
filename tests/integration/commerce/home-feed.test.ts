/**
 * The living Home stream (Release 0.7) over real HTTP + embedded PG. One chronological
 * blend of deals and sparks (each behind its own visibility conjunction), per-visitor
 * flags, and "new since your last visit": cookie-only watermarks on the visitor
 * identity — the marker holds steady within a browsing session and advances when a
 * new session starts. The Following badge counts what followed stores did meanwhile.
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
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `h-${uuidv7()}@example.com`, password: 'a long passphrase' } })
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

function cookieValue(headers: Headers, name: string): string | null {
  const match = new RegExp(`${name}=([^;]+)`).exec(headers.get('set-cookie') ?? '')
  return match ? decodeURIComponent(match[1]!) : null
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('the living Home (Release 0.7)', () => {
  it('blends sparks and deals chronologically, each behind its own conjunction', async () => {
    const m = await merchant()
    const deal = await http.request('POST', '/api/v1/deals', {
      headers: { cookie: m.cookie },
      body: { product_id: m.productId, store_id: m.storeId, headline: 'Weekend special' },
    })
    await http.request('POST', '/api/v1/sparks', {
      headers: { cookie: m.cookie },
      body: { business_id: m.businessId, store_id: m.storeId, body: 'Fresh off the needles.' },
    })

    const home = await http.request('GET', '/api/v1/public/home')
    expect(home.status).toBe(200)
    expect(home.headers.get('cache-control')).toContain('private')
    // newest first: the spark landed after the deal
    expect(home.body.items.map((i: { type: string }) => i.type)).toEqual(['spark', 'deal'])
    expect(home.body.items[0]).toMatchObject({ text: 'Fresh off the needles.', store_name: 'Rosa Knits' })
    expect(home.body.items[1]).toMatchObject({ text: 'Weekend special', product_title: 'Lavender blanket', price_minor: 4500 })

    // conjunction: unpublish the product → the deal drops, the spark stays
    await http.request('POST', `/api/v1/products/${m.productId}/unpublish-from-store`, {
      headers: { cookie: m.cookie }, body: { store_id: m.storeId },
    })
    const after = await http.request('GET', '/api/v1/public/home')
    expect(after.body.items.map((i: { type: string }) => i.type)).toEqual(['spark'])
    void deal
  })

  it('tracks last visit on cookies: first visit has no watermark; a new session marks new items', async () => {
    const m = await merchant()
    await http.request('POST', '/api/v1/sparks', {
      headers: { cookie: m.cookie },
      body: { business_id: m.businessId, store_id: m.storeId, body: 'Old news.' },
    })

    // first visit: no watermark, nothing marked new, seen cookie minted
    const first = await http.request('GET', '/api/v1/public/home')
    expect(first.body.last_visit).toBeNull()
    expect(first.body.items[0].is_new).toBe(false)
    const seenAt = cookieValue(first.headers, 'dof_seen_at')
    expect(seenAt).not.toBeNull()

    // same session (fresh seen cookie): the watermark does not advance
    const sameSession = await http.request('GET', '/api/v1/public/home', {
      headers: { cookie: `dof_seen_at=${encodeURIComponent(seenAt!)}` },
    })
    expect(sameSession.body.last_visit).toBeNull()

    // a NEW session (stale seen cookie): the old session's timestamp becomes the watermark.
    // Backdate the first spark so the 1-hour-old watermark actually sits between the two.
    await container.pool.query(`UPDATE sparks SET published_at = now() - interval '2 hours' WHERE body = 'Old news.'`)
    const staleSeen = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    await http.request('POST', '/api/v1/sparks', {
      headers: { cookie: m.cookie },
      body: { business_id: m.businessId, store_id: m.storeId, body: 'Hot off the press.' },
    })
    const newSession = await http.request('GET', '/api/v1/public/home', {
      headers: { cookie: `dof_seen_at=${encodeURIComponent(staleSeen)}` },
    })
    expect(newSession.body.last_visit).toBe(staleSeen)
    const flags = Object.fromEntries(newSession.body.items.map((i: { text: string; is_new: boolean }) => [i.text, i.is_new]))
    expect(flags).toEqual({ 'Hot off the press.': true, 'Old news.': false })
    expect(cookieValue(newSession.headers, 'dof_last_visit')).toBe(staleSeen)
  })

  it('the Following filter and badge answer "what did my stores do since I was here?"', async () => {
    const followed = await merchant()
    const stranger = await merchant()

    // the visitor follows one store
    const follow = await http.request('POST', `/api/v1/public/stores/${followed.handle}/follow`)
    const visitor = `dof_visitor=${/dof_visitor=([^;]+)/.exec(follow.headers.get('set-cookie') ?? '')![1]}`

    // both stores publish afterwards
    await http.request('POST', '/api/v1/sparks', {
      headers: { cookie: followed.cookie },
      body: { business_id: followed.businessId, store_id: followed.storeId, body: 'From your store.' },
    })
    await http.request('POST', '/api/v1/deals', {
      headers: { cookie: followed.cookie },
      body: { product_id: followed.productId, store_id: followed.storeId, headline: 'Your deal' },
    })
    await http.request('POST', '/api/v1/sparks', {
      headers: { cookie: stranger.cookie },
      body: { business_id: stranger.businessId, store_id: stranger.storeId, body: 'From a stranger.' },
    })

    // a returning session: watermark before the publishes → badge counts only followed stores
    const staleSeen = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const home = await http.request('GET', '/api/v1/public/home?filter=following', {
      headers: { cookie: `${visitor}; dof_seen_at=${encodeURIComponent(staleSeen)}` },
    })
    expect(home.body.new_following_count).toBe(2)
    expect(home.body.items.map((i: { text: string }) => i.text)).toEqual(['Your deal', 'From your store.'])
    expect(home.body.items.every((i: { viewer_follows: boolean; is_new: boolean }) => i.viewer_follows && i.is_new)).toBe(true)

    // saved stays deal-scoped and empty-world without saves
    const saved = await http.request('GET', '/api/v1/public/home?filter=saved', { headers: { cookie: visitor } })
    expect(saved.body.items).toEqual([])
    // anonymous personal filters stay empty worlds
    const anon = await http.request('GET', '/api/v1/public/home?filter=following')
    expect(anon.body.items).toEqual([])
    expect(anon.body.new_following_count).toBe(0)
  })
})
