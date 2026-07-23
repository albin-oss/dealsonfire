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
    // newest first: spark, then deal, then the store's debut card (no product card —
    // a product without a photo isn't noteworthy)
    expect(home.body.items.map((i: { type: string }) => i.type)).toEqual(['spark', 'deal', 'store'])
    expect(home.body.items[0]).toMatchObject({ text: 'Fresh off the needles.', store_name: 'Rosa Knits' })
    expect(home.body.items[1]).toMatchObject({ text: 'Weekend special', product_title: 'Lavender blanket', price_minor: 4500 })
    expect(home.body.items[2]).toMatchObject({ type: 'store', text: 'Rosa Knits' })

    // a photo crosses the noteworthy bar → the product joins the stream
    const mediaId = uuidv7()
    await container.pool.query(
      `INSERT INTO media_assets (id, business_id, url, content_type, size_bytes, created_by)
       VALUES ($1, $2, 'https://sandbox.media.local/blanket.webp', 'image/webp', 1024, $3)`,
      [mediaId, m.businessId, uuidv7()])
    await http.request('POST', `/api/v1/products/${m.productId}/media`, {
      headers: { cookie: m.cookie }, body: { media_id: mediaId, role: 'hero', alt_text: 'Lavender blanket' },
    })
    const withProduct = await http.request('GET', '/api/v1/public/home')
    const productCard = withProduct.body.items.find((i: { type: string }) => i.type === 'product')
    expect(productCard).toMatchObject({ text: 'Lavender blanket', price_minor: 4500, image_url: 'https://sandbox.media.local/blanket.webp' })

    // conjunction: unpublish the product → the deal AND product card drop, spark + debut stay
    await http.request('POST', `/api/v1/products/${m.productId}/unpublish-from-store`, {
      headers: { cookie: m.cookie }, body: { store_id: m.storeId },
    })
    const after = await http.request('GET', '/api/v1/public/home')
    expect(after.body.items.map((i: { type: string }) => i.type)).toEqual(['spark', 'store'])
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
    expect(first.body.items.every((i: { is_new: boolean }) => !i.is_new)).toBe(true)
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
    const sparks = newSession.body.items.filter((i: { type: string }) => i.type === 'spark')
    const flags = Object.fromEntries(sparks.map((i: { text: string; is_new: boolean }) => [i.text, i.is_new]))
    expect(flags).toEqual({ 'Hot off the press.': true, 'Old news.': false })
    expect(cookieValue(newSession.headers, 'dof_last_visit')).toBe(staleSeen)
  })

  it('"my merchants" makes the follow data a visible possession (Release 1.0)', async () => {
    const rosa = await merchant()
    const jonas = await merchant()

    // anonymous: no possession
    const anon = await http.request('GET', '/api/v1/public/home')
    expect(anon.body.my_merchants).toEqual([])

    // follow both → they appear, newest follow first, with the brand tagline when written
    await http.request('PUT', `/api/v1/stores/${rosa.storeId}/brand-kit`, {
      headers: { cookie: rosa.cookie },
      body: { name: 'Rosa Knits', voice: { tone: 'Soft things, made slowly.' } },
    })
    const follow1 = await http.request('POST', `/api/v1/public/stores/${rosa.handle}/follow`)
    const visitor = `dof_visitor=${/dof_visitor=([^;]+)/.exec(follow1.headers.get('set-cookie') ?? '')![1]}`
    await http.request('POST', `/api/v1/public/stores/${jonas.handle}/follow`, { headers: { cookie: visitor } })

    const mine = await http.request('GET', '/api/v1/public/home', { headers: { cookie: visitor } })
    expect(mine.body.my_merchants.map((m: { handle: string }) => m.handle)).toEqual([jonas.handle, rosa.handle])
    expect(mine.body.my_merchants[1]).toMatchObject({ name: 'Rosa Knits', tagline: 'Soft things, made slowly.' })

    // the storefront snapshot answers follower count + viewer state (and unfollow flows back)
    const snap = await http.request('GET', `/api/v1/public/stores/${rosa.handle}/engagement`, { headers: { cookie: visitor } })
    expect(snap.body).toEqual({ followers: 1, viewer_follows: true })
    await http.request('POST', `/api/v1/public/stores/${rosa.handle}/follow`, { headers: { cookie: visitor } })
    const after = await http.request('GET', '/api/v1/public/home', { headers: { cookie: visitor } })
    expect(after.body.my_merchants.map((m: { handle: string }) => m.handle)).toEqual([jonas.handle])
    // draft/unknown stores are masked
    expect((await http.request('GET', '/api/v1/public/stores/nobody-here/engagement')).status).toBe(404)
  })

  it('voice filters narrow the blend — and survive any branch leading the union (Capability 02)', async () => {
    const m = await merchant()
    const products = await http.request('GET', `/api/v1/products?business_id=${m.businessId}&limit=1`, { headers: { cookie: m.cookie } })
    await http.request('POST', '/api/v1/deals', {
      headers: { cookie: m.cookie },
      body: { product_id: products.body.items[0].id, store_id: m.storeId, headline: 'Voice test deal' },
    })
    await http.request('POST', '/api/v1/sparks', {
      headers: { cookie: m.cookie },
      body: { business_id: m.businessId, store_id: m.storeId, body: 'Voice test spark.' },
    })
    // regression: only the deal branch carried column aliases; a voice whose first
    // branch was NOT deals returned null types (or 500 on sort_key)
    for (const [voice, types] of [
      ['deals', ['deal']], ['sparks', ['spark']], ['products', []],
      ['makers', ['store']], ['all', ['spark', 'deal', 'store']],
    ] as const) {
      const res = await http.request('GET', `/api/v1/public/home?voice=${voice}`)
      expect(res.status).toBe(200)
      const got = [...new Set(res.body.items.map((i: { type: string }) => i.type))].sort()
      expect(got).toEqual([...types].sort())
    }
  })

  it('a written story becomes a Meet-the-Maker card; silence stays silent (Release 0.9)', async () => {
    const m = await merchant()

    // no story → no maker card
    const before = await http.request('GET', '/api/v1/public/home')
    expect(before.body.items.some((i: { type: string }) => i.type === 'maker')).toBe(false)

    // writing the story IS publishing — the card appears at the identity's timestamp
    await http.request('PUT', `/api/v1/stores/${m.storeId}/brand-kit`, {
      headers: { cookie: m.cookie },
      body: {
        name: 'Rosa Knits',
        voice: {
          tone: 'Soft things, made slowly.',
          story: 'Rosa Knits started at a kitchen table — one person who cared too much about wool.',
          promise: 'If something isn’t right, we make it right.',
        },
      },
    })
    const after = await http.request('GET', '/api/v1/public/home')
    const maker = after.body.items.find((i: { type: string }) => i.type === 'maker')
    expect(maker).toMatchObject({
      text: 'Rosa Knits',
      story: 'Rosa Knits started at a kitchen table — one person who cared too much about wool.',
      promise: 'If something isn’t right, we make it right.',
      store_handle: m.handle,
    })
    // newest first: the identity was written after everything else
    expect(after.body.items[0].type).toBe('maker')

    // the Following stream carries the maker of a followed store
    const follow = await http.request('POST', `/api/v1/public/stores/${m.handle}/follow`)
    const visitor = `dof_visitor=${/dof_visitor=([^;]+)/.exec(follow.headers.get('set-cookie') ?? '')![1]}`
    const following = await http.request('GET', '/api/v1/public/home?filter=following', { headers: { cookie: visitor } })
    expect(following.body.items.some((i: { type: string }) => i.type === 'maker')).toBe(true)
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
    expect(home.body.items.map((i: { text: string }) => i.text)).toEqual(['Your deal', 'From your store.', 'Rosa Knits'])
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
