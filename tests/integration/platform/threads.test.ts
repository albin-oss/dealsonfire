/**
 * LS-5 — threads between things, attacked.
 *
 * Laws under fire: a thing never threads to itself or its own store through
 * "nearby" (cross-merchant by construction); one merchant cannot monopolize
 * nearby (one item per store); held/draft/deleted content appears in NO
 * thread — including when the hold lands after the fact; sparse worlds
 * return absent threads, never filler; an invisible subject threads to
 * nothing (no oracle); everything is deterministic; thread arrivals record
 * under the LS-1 privacy law.
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

async function makeProduct(w: { cookie: string; businessId: string; storeId: string }, title: string, description?: string) {
  const r = await http.request('POST', '/api/v1/products', {
    headers: { cookie: w.cookie },
    body: {
      business_id: w.businessId, title, fulfillment_kind: 'physical',
      ...(description ? { description: { format: 'plain', content: description } } : {}),
      default_price: { amount: 2500, currency: 'EUR' }, publish_to_store_id: w.storeId,
    },
  })
  return r.body.product_id as string
}

async function makeSpark(w: { cookie: string; businessId: string; storeId: string }, body: string) {
  const r = await http.request('POST', '/api/v1/sparks', {
    headers: { cookie: w.cookie }, body: { business_id: w.businessId, store_id: w.storeId, body },
  })
  return r.body.spark_id as string
}

const threads = (type: string, id: string) =>
  http.request('GET', `/api/v1/public/threads?subject_type=${type}&subject_id=${id}`)

beforeAll(async () => {
  container = newTestContainer()
  setContainer(container)
  http = await startTestApp()
})
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => {
  await truncateAll(container.pool)
  ;(container.rateLimiter as { reset?: () => void }).reset?.()
})

describe('LS-5 — explainable relationships only, honestly bounded', () => {
  it('voice = the maker speaking; nearby = same lane, OTHER makers only, one per store; never itself', async () => {
    const rosa = await makeStore('Rosa Knits', 'rosa-knits')
    const blanket = await makeProduct(rosa, 'Lavender Wool Blanket', 'knitted merino wool')
    await makeSpark(rosa, 'winding forty skeins by hand tonight')
    const fresh = await makeStore('Fresh Thread', 'fresh-thread')
    await makeProduct(fresh, 'Wool Quilt', 'soft patchwork wool')
    await makeProduct(fresh, 'Second Wool Quilt', 'even softer wool') // same store: only ONE may appear
    const marta = await makeStore('Marta Ceramics', 'marta-ceramics')
    await makeProduct(marta, 'Wool-dyeing Bowl', 'a knit-friendly wool bowl')

    const r = await threads('product', blanket)
    expect(r.status).toBe(200)
    expect(r.body.voice.excerpt).toContain('forty skeins')          // the maker's own words
    expect(r.body.nearby.lane_id).toBe('soft-wearable')             // the honest lane label
    const stores = r.body.nearby.items.map((n: { store_handle: string }) => n.store_handle)
    expect(stores).not.toContain('rosa-knits')                      // never its own store
    expect(new Set(stores).size).toBe(stores.length)                // one per store — no monopoly
    expect(r.body.nearby.items.map((n: { product_id: string }) => n.product_id)).not.toContain(blanket)
  })

  it('sparse world: no spark → no voice; no lane neighbors → no nearby; never filler, never an error', async () => {
    const lonely = await makeStore('Lone Wolf Woodworks', 'lone-wolf')
    const spoon = await makeProduct(lonely, 'Walnut Spoon', 'hand carved from walnut')
    const r = await threads('product', spoon)
    expect(r.status).toBe(200)
    expect(r.body.voice).toBeNull()
    expect(r.body.nearby).toBeNull() // "walnut spoon" matches no registered lane — absent, not invented
  })

  it('held stores appear in NO thread — voice and nearby, including holds that land after publication', async () => {
    const rosa = await makeStore('Rosa Knits', 'rosa-knits')
    const blanket = await makeProduct(rosa, 'Lavender Wool Blanket', 'knitted merino')
    const rival = await makeStore('Zanzibar Wool', 'zanzibar-wool')
    await makeProduct(rival, 'Suspicious Wool Scarf', 'knitted contraband wool')

    const before = await threads('product', blanket)
    expect(before.body.nearby.items.map((n: { store_handle: string }) => n.store_handle)).toContain('zanzibar-wool')
    await container.pool.query(`UPDATE stores SET enforcement_hold = 'under_review' WHERE id = $1`, [rival.storeId])
    const after = await threads('product', blanket)
    const handles = after.body.nearby?.items.map((n: { store_handle: string }) => n.store_handle) ?? []
    expect(handles).not.toContain('zanzibar-wool') // the hold is instant in threads too

    // and a held SUBJECT threads to nothing (no oracle through the thread door)
    await container.pool.query(`UPDATE stores SET enforcement_hold = 'under_review' WHERE id = $1`, [rosa.storeId])
    const heldSubject = await threads('product', blanket)
    expect(heldSubject.body).toMatchObject({ voice: null, nearby: null })
  })

  it('bad subjects refuse cleanly; a fabricated id threads to nothing', async () => {
    expect((await threads('store', uuidv7())).status).toBe(422)     // only product/deal subjects
    expect((await threads('product', 'not-a-uuid')).status).toBe(422)
    const ghost = await threads('product', uuidv7())
    expect(ghost.status).toBe(200)
    expect(ghost.body).toMatchObject({ voice: null, nearby: null })
  })

  it('a thread arrival records source=thread under the LS-1 law (no identity minted)', async () => {
    const rosa = await makeStore('Rosa Knits', 'rosa-knits')
    const blanket = await makeProduct(rosa, 'Lavender Wool Blanket')
    const r = await http.request('POST', '/api/v1/public/attention', {
      body: { events: [{ type: 'product_view', subject_type: 'product', subject_id: blanket, source: 'thread' }] },
    })
    expect(r.status).toBe(200)
    expect(r.body.accepted).toBe(1)
    expect(r.headers.get('set-cookie')).toBeNull()
    const { rows } = await container.pool.query(
      `SELECT source, visitor_id FROM attention_facts WHERE event_type = 'product_view'`)
    expect(rows[0]).toMatchObject({ source: 'thread', visitor_id: null })
  })
})
