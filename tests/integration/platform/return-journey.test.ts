/**
 * LS-6 — the return journey, attacked.
 *
 * Laws under fire: "new to me" means published-after-the-watermark, from a
 * FOLLOWED shop, still visible — never inferred, never ranking-resurfaced,
 * never ancient; a read never advances the watermark (refresh-safe); held /
 * unpublished / deleted content is absent; an unfollowed shop's change never
 * appears; a no-follows / no-watermark visitor gets an honest empty return
 * (cold start); the summary counts are truthful.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function makeStore(name: string, handle: string, opts: { hold?: boolean } = {}) {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `m-${uuidv7()}@maker.example`, password: 'a maker passphrase' } })
  const cookie = `dof_session=${decodeURIComponent(/dof_session=([^;]+)/.exec(reg.headers.get('set-cookie') ?? '')![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: name } })
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name, handle } })
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
  if (opts.hold) await container.pool.query(`UPDATE stores SET enforcement_hold = 'under_review' WHERE id = $1`, [store.body.store_id])
  return { cookie, businessId: biz.body.business_id as string, storeId: store.body.store_id as string }
}
async function makeProduct(w: { cookie: string; businessId: string; storeId: string }, title: string) {
  const r = await http.request('POST', '/api/v1/products', {
    headers: { cookie: w.cookie },
    body: { business_id: w.businessId, title, fulfillment_kind: 'physical', default_price: { amount: 2500, currency: 'EUR' }, publish_to_store_id: w.storeId },
  })
  // return: things need a photo to count (same law as the feed) — mint one
  const pid = r.body.product_id as string
  const mediaId = uuidv7()
  await container.pool.query(
    `INSERT INTO media_assets (id, business_id, url, content_type, size_bytes, created_by)
     VALUES ($1, $2, 'https://img.example/x.jpg', 'image/jpeg', 1000, $2)`, [mediaId, w.businessId])
  await container.pool.query(
    `INSERT INTO product_media (id, product_id, business_id, media_id, role, position)
     VALUES ($1, $2, $3, $4, 'hero', 0)`, [uuidv7(), pid, w.businessId, mediaId])
  return pid
}
async function makeSpark(w: { cookie: string; businessId: string; storeId: string }, body: string) {
  const r = await http.request('POST', '/api/v1/sparks', { headers: { cookie: w.cookie }, body: { business_id: w.businessId, store_id: w.storeId, body } })
  return r.body.spark_id as string
}
/** A visitor who follows `handle`; returns their visitor cookie. */
async function followerOf(handle: string) {
  const r = await http.request('POST', `/api/v1/public/stores/${handle}/follow`, { body: {} })
  return /dof_visitor=[^;]+/.exec(r.headers.get('set-cookie') ?? '')![0]
}
/** since-you-were-here with a given visitor cookie and last_visit watermark. */
const since = (cookie: string, lastVisit?: string) =>
  http.request('GET', '/api/v1/public/since', {
    headers: { cookie: lastVisit ? `${cookie}; dof_last_visit=${encodeURIComponent(lastVisit)}` : cookie },
  })

const WATERMARK = new Date(Date.now() - 3 * 86_400_000).toISOString() // "last here 3 days ago"

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('LS-6 — the street remembers, honestly', () => {
  it('followed-shop changes since the watermark appear; the voice leads; counts are truthful', async () => {
    const rosa = await makeStore('Rosa Knits', 'rosa-knits')
    const cookie = await followerOf('rosa-knits')
    // publish AFTER the watermark
    await makeSpark(rosa, 'winding forty skeins by hand tonight')
    await makeProduct(rosa, 'Lavender Blanket')

    const r = await since(cookie, WATERMARK)
    expect(r.status).toBe(200)
    expect(r.body.has_changes).toBe(true)
    expect(r.body.voices[0].excerpt).toContain('forty skeins') // the maker's voice
    expect(r.body.things).toHaveLength(1)
    expect(r.body.counts).toMatchObject({ voices: 1, things: 1, makers: 1 })
  })

  it('a read NEVER advances the watermark — refresh shows the same changes', async () => {
    const rosa = await makeStore('Rosa Knits', 'rosa-knits')
    const cookie = await followerOf('rosa-knits')
    await makeSpark(rosa, 'a fresh update')
    const first = await since(cookie, WATERMARK)
    const firstSetCookie = first.headers.get('set-cookie')
    const second = await since(cookie, WATERMARK)
    expect(second.body.voices).toHaveLength(1)                 // still there on refresh
    expect(firstSetCookie).toBeNull()                          // the read wrote no watermark
  })

  it('ancient content is never "new"; ranking resurfacing is not newness', async () => {
    const rosa = await makeStore('Rosa Knits', 'rosa-knits')
    const cookie = await followerOf('rosa-knits')
    const old = await makeSpark(rosa, 'this is from long ago')
    await container.pool.query(`UPDATE sparks SET published_at = now() - interval '90 days' WHERE id = $1`, [old])
    const r = await since(cookie, WATERMARK)
    expect(r.body.has_changes).toBe(false) // published before the watermark → not new
  })

  it('an unfollowed shop never appears; only deliberate follows count', async () => {
    const rosa = await makeStore('Rosa Knits', 'rosa-knits')
    const stranger = await makeStore('Not Followed Co', 'not-followed')
    const cookie = await followerOf('rosa-knits')
    await makeSpark(stranger, 'nobody follows me but here I am')
    await makeSpark(rosa, 'but you follow me')
    const r = await since(cookie, WATERMARK)
    expect(r.body.voices).toHaveLength(1)
    expect(r.body.voices[0].store_handle).toBe('rosa-knits')
  })

  it('held / unpublished content is absent, including a hold that lands after publication', async () => {
    const rosa = await makeStore('Rosa Knits', 'rosa-knits')
    const cookie = await followerOf('rosa-knits')
    await makeSpark(rosa, 'about to be hidden')
    const before = await since(cookie, WATERMARK)
    expect(before.body.has_changes).toBe(true)
    await container.pool.query(`UPDATE stores SET enforcement_hold = 'under_review' WHERE id = $1`, [rosa.storeId])
    const after = await since(cookie, WATERMARK)
    expect(after.body.has_changes).toBe(false) // the followed shop went dark — nothing to return to
  })

  it('cold start: no follows, or no prior visit → honest empty return (never fabricated)', async () => {
    const rosa = await makeStore('Rosa Knits', 'rosa-knits')
    await makeSpark(rosa, 'a spark with no audience yet')
    // a visitor who follows nobody
    const noFollows = await http.request('POST', `/api/v1/public/deals/${uuidv7()}/react`, { body: {} })
    const lonelyCookie = /dof_visitor=[^;]+/.exec(noFollows.headers.get('set-cookie') ?? '')?.[0] ?? 'dof_visitor=' + uuidv7()
    const noFollowResult = await since(lonelyCookie, WATERMARK)
    expect(noFollowResult.body.has_changes).toBe(false)
    // a follower with NO prior visit (no watermark) — nothing to measure against
    const cookie = await followerOf('rosa-knits')
    const firstVisit = await since(cookie) // no dof_last_visit
    expect(firstVisit.body.since).toBeNull()
    expect(firstVisit.body.has_changes).toBe(false)
  })
})
