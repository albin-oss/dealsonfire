/**
 * LS-2 — street search, attacked.
 *
 * The two laws under fire: search must never become a VISIBILITY ORACLE (a
 * held/unpublished thing is unreachable through every path — words, stems,
 * stories, AND typo rescue), and relevance must be EXPLAINABLE (name beats
 * said-about beats story; popularity is never an input). Plus the human-input
 * survival suite: plurals, word order, typos, natural phrases, operators.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function makeStore(opts: {
  name: string; handle: string; story?: string; tagline?: string; hold?: boolean
}) {
  const email = `m-${uuidv7()}@maker.example`
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email, password: 'a maker passphrase' } })
  const cookie = `dof_session=${decodeURIComponent(/dof_session=([^;]+)/.exec(reg.headers.get('set-cookie') ?? '')![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: opts.name } })
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: opts.name, handle: opts.handle } })
  if (opts.story || opts.tagline) {
    await container.pool.query(
      `UPDATE brand_kits SET voice = voice || $2::jsonb WHERE owner_type = 'store' AND owner_id = $1`,
      [store.body.store_id, JSON.stringify({ story: opts.story ?? '', tone: opts.tagline ?? '' })])
  }
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
  if (opts.hold) {
    await container.pool.query(`UPDATE stores SET enforcement_hold = 'under_review' WHERE id = $1`, [store.body.store_id])
  }
  return { cookie, businessId: biz.body.business_id as string, storeId: store.body.store_id as string }
}

async function makeProduct(world: { cookie: string; businessId: string; storeId: string }, title: string, description?: string) {
  const prod = await http.request('POST', '/api/v1/products', {
    headers: { cookie: world.cookie },
    body: {
      business_id: world.businessId, title, fulfillment_kind: 'physical',
      ...(description ? { description: { format: 'plain', content: description } } : {}),
      default_price: { amount: 2500, currency: 'EUR' }, publish_to_store_id: world.storeId,
    },
  })
  return prod.body.product_id as string
}

const search = (q: string, extra = '') => http.request('GET', `/api/v1/public/search?q=${encodeURIComponent(q)}${extra}`)

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

describe('LS-2 — search survives human input', () => {
  it('stems, word order, phrases, and stories all find the thing', async () => {
    const w = await makeStore({ name: 'Rosa Knits', handle: 'rosa-knits', story: 'started at a kitchen table, one blanket at a time', tagline: 'soft things, made slowly' })
    await makeProduct(w, 'Lavender Blanket', 'hand-dyed merino, heavy enough for winter evenings')

    const plural = await search('blankets') // stem: blankets → blanket
    expect(plural.body.products.map((p: { title: string }) => p.title)).toContain('Lavender Blanket')
    const reversed = await search('blanket lavender') // word order free
    expect(reversed.body.products).toHaveLength(1)
    const descWords = await search('winter evenings') // description text is searchable truth
    expect(descWords.body.products).toHaveLength(1)
    const storyWords = await search('kitchen table') // the maker's story is a door
    expect(storyWords.body.shops.map((s: { name: string }) => s.name)).toContain('Rosa Knits')
    expect(storyWords.body.shops[0].excerpt).toContain('⟪')  // matched words shown in context
    const tagline = await search('soft things')
    expect(tagline.body.shops).toHaveLength(1)
  })

  it('a typo is rescued by similarity — and says so honestly', async () => {
    const w = await makeStore({ name: 'Rosa Knits', handle: 'rosa-knits' })
    await makeProduct(w, 'Lavender Blanket')
    const typo = await search('lavendar')
    expect(typo.body.fuzzy).toBe(true)
    expect(typo.body.products.map((p: { title: string }) => p.title)).toContain('Lavender Blanket')
  })

  it('search operators and junk cannot break or widen the query', async () => {
    const w = await makeStore({ name: 'Rosa Knits', handle: 'rosa-knits' })
    await makeProduct(w, 'Lavender Blanket')
    for (const evil of ['lavender OR 1=1', '"unclosed phrase', 'a & b | c ! d', '); DROP TABLE stores;--']) {
      const r = await search(evil)
      expect(r.status).toBe(200) // parsed, never executed
    }
    const bounds = await Promise.all([search('a'), search('x'.repeat(81))])
    expect(bounds.map((b) => b.status)).toEqual([422, 422]) // VALIDATION_FAILED renders as 422
  })

  it('what a thing is CALLED beats what is said about it (explainable rank, no popularity)', async () => {
    const w = await makeStore({ name: 'The Wool Shop', handle: 'wool-shop' })
    await makeProduct(w, 'Alpaca Socks', 'softer than lavender fields in summer') // B-weight mention
    await makeProduct(w, 'Lavender Blanket', 'a heavy throw')                      // A-weight title
    const r = await search('lavender')
    expect(r.body.products[0].title).toBe('Lavender Blanket') // title match outranks description mention
    expect(r.body.products).toHaveLength(2)
  })
})

describe('LS-2 — search is never a visibility oracle', () => {
  it('a held store vanishes through EVERY path: name, story, products, deals, sparks, and typo rescue', async () => {
    const held = await makeStore({
      name: 'Zanzibar Curios', handle: 'zanzibar-curios',
      story: 'we import xylophonic seashells from the quiet archipelago', hold: true,
    })
    await makeProduct(held, 'Xylophonic Seashell', 'a one-of-a-kind resonant curio')

    for (const q of ['zanzibar', 'curios', 'xylophonic', 'seashells', 'quiet archipelago', 'resonant']) {
      const r = await search(q)
      const all = [...r.body.shops, ...r.body.products, ...r.body.deals, ...r.body.sparks]
      expect(all, `"${q}" leaked a held store`).toHaveLength(0)
    }
    const typo = await search('zanzibr') // fuzzy path honors the same law
    expect([...typo.body.shops, ...typo.body.products]).toHaveLength(0)
    expect(typo.body.fuzzy).toBe(false) // nothing found ≠ fuzzy-found-nothing-to-say
  })

  it('an unpublished product is unsearchable; publishing makes it findable; a hold makes it vanish again without reindexing', async () => {
    const w = await makeStore({ name: 'Grain and Crumb', handle: 'grain-crumb' })
    const prod = await http.request('POST', '/api/v1/products', {
      headers: { cookie: w.cookie },
      body: { business_id: w.businessId, title: 'Midnight Sourdough', fulfillment_kind: 'physical', default_price: { amount: 700, currency: 'EUR' } },
    })
    expect(prod.status).toBe(201)
    const hidden = await search('sourdough')
    expect(hidden.body.products).toHaveLength(0) // draft: invisible

    await makeProduct(w, 'Morning Sourdough', 'slow-fermented overnight')
    const visible = await search('sourdough')
    expect(visible.body.products.map((p: { title: string }) => p.title)).toEqual(['Morning Sourdough'])

    await container.pool.query(`UPDATE stores SET enforcement_hold = 'under_review' WHERE id = $1`, [w.storeId])
    const gone = await search('sourdough')
    expect(gone.body.products).toHaveLength(0) // the hold is instant — no index rebuild involved
  })
})

describe('LS-2 — scopes and paging', () => {
  it('scope widens a group with honest totals; paging is bounded; page beyond the end is empty, not an error', async () => {
    const w = await makeStore({ name: 'Pixel and Paper', handle: 'pixel-paper' })
    for (let i = 1; i <= 7; i++) await makeProduct(w, `Riso Print No ${i}`, 'small prints for small walls')
    const grouped = await search('riso print')
    expect(grouped.body.products).toHaveLength(5) // preview per group
    expect(grouped.body.totals.products).toBe(7)  // the honest total

    const scoped = await search('riso print', '&scope=products')
    expect(scoped.body.products).toHaveLength(7)
    const beyond = await search('riso print', '&scope=products&page=3')
    expect(beyond.status).toBe(200)
    expect(beyond.body.products).toHaveLength(0)
    expect(beyond.body.fuzzy).toBe(false) // deep pages never fall into the fuzzy path
    const insane = await search('riso print', '&scope=products&page=999')
    expect(insane.status).toBe(200) // clamped, never a 500
  })
})
