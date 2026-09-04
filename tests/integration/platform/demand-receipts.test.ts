/**
 * LS-7 — demand receipts, attacked.
 *
 * Every merchant sentence must be falsifiable to specific rows. Laws under
 * fire: people = DISTINCT visitor_id (one hammering visitor = one person);
 * anonymous glances never become people; fabricated subjects never influence
 * a receipt; a merchant reads ONLY their own evidence (isolation); low-count
 * search phrases are withheld (k-anonymity); a held subject is never NAMED
 * (counts historical, names current-visibility-gated); a zero-data merchant
 * gets an honest, non-punishing empty receipt.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { demandReceipts, SEARCH_MIN_PEOPLE } from '../../../server/utils/demand-receipts'
import { uuidv7 } from '@platform/uuid'

let container: Container

/** A live store with a business, returning ids we can attach facts to. */
async function makeStore(name: string) {
  const businessId = uuidv7(); const storeId = uuidv7(); const userId = uuidv7()
  await container.pool.query(`INSERT INTO users (id, email, email_verified, status) VALUES ($1, $2, true, 'active')`, [userId, `m-${userId}@x.example`])
  await container.pool.query(`INSERT INTO businesses (id, business_type, display_name, standing) VALUES ($1, 'individual', $2, 'good')`, [businessId, name])
  await container.pool.query(
    `INSERT INTO staff_memberships (id, business_id, principal_type, principal_id, roles, status) VALUES ($1, $2, 'user', $3, ARRAY['owner'], 'active')`,
    [uuidv7(), businessId, userId])
  await container.pool.query(
    `INSERT INTO stores (id, business_id, handle, name, status, enforcement_hold, published_at) VALUES ($1, $2, $3, $4, 'live', 'none', now())`,
    [storeId, businessId, name.toLowerCase().replace(/[^a-z]+/g, '-'), name])
  return { businessId, storeId, userId }
}
async function makeProduct(w: { businessId: string; storeId: string }, title: string, opts: { held?: boolean } = {}) {
  const productId = uuidv7()
  await container.pool.query(
    `INSERT INTO products (id, business_id, title, fulfillment_kind, status) VALUES ($1, $2, $3, 'physical', 'active')`,
    [productId, w.businessId, title])
  await container.pool.query(
    `INSERT INTO listings (id, business_id, product_id, channel_id, status, published_at) VALUES ($1, $2, $3, $4, $5, now())`,
    [uuidv7(), w.businessId, productId, w.storeId, opts.held ? 'unpublished' : 'published'])
  return productId
}
/** Record a view; visitorId null = an anonymous glance. */
async function view(w: { storeId: string }, subjectType: string, subjectId: string, source: string, visitorId: string | null, daysAgo = 0) {
  await container.pool.query(
    `INSERT INTO attention_facts (id, event_type, subject_type, subject_id, store_id, source, visitor_id, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() - ($8 || ' days')::interval)`,
    [uuidv7(), `${subjectType}_view`, subjectType, subjectId, w.storeId, source, visitorId, String(daysAgo)])
}
async function searchClick(w: { storeId: string }, subjectId: string, phrase: string, visitorId: string) {
  await container.pool.query(
    `INSERT INTO attention_facts (id, event_type, subject_type, subject_id, store_id, source, visitor_id, query, occurred_at)
     VALUES ($1, 'search_click', 'product', $2, $3, 'search', $4, $5, now())`,
    [uuidv7(), subjectId, w.storeId, visitorId, phrase])
}
const receipts = (businessId: string) => container.deps.uow.withTransaction((tx) => demandReceipts(tx, businessId))

beforeAll(() => { container = newTestContainer(); setContainer(container) })
afterAll(async () => { setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool) })

describe('LS-7 — every sentence falsifies to rows', () => {
  it('did anyone find me: distinct people vs glances; one hammering visitor is ONE person', async () => {
    const w = await makeStore('Rosa Knits')
    const v = uuidv7()
    for (let i = 0; i < 10; i++) await view(w, 'store', w.storeId, 'home', v)       // one person, ten views
    for (let i = 0; i < 5; i++) await view(w, 'store', w.storeId, 'home', null)      // five glances
    const r = await receipts(w.businessId)
    expect(r.found.people).toBe(1)     // not 10
    expect(r.found.glances).toBe(5)
    expect(r.sentences[0]).toContain('1 person found your shop')
    expect(r.sentences[0]).toContain('the Street feed')
  })

  it('glances-only shop: no people claimed, honest glance language', async () => {
    const w = await makeStore('Quiet Co')
    for (let i = 0; i < 4; i++) await view(w, 'store', w.storeId, 'shops', null)
    const r = await receipts(w.businessId)
    expect(r.found.people).toBe(0)
    expect(r.sentences[0]).toContain('glances, not yet people')
  })

  it('what caught attention names the top subject by distinct people', async () => {
    const w = await makeStore('Rosa Knits')
    const blanket = await makeProduct(w, 'Lavender Blanket')
    const scarf = await makeProduct(w, 'Wool Scarf')
    await view(w, 'product', blanket, 'home', uuidv7())
    await view(w, 'product', blanket, 'home', uuidv7()) // 2 distinct people
    await view(w, 'product', scarf, 'home', uuidv7())   // 1
    const r = await receipts(w.businessId)
    expect(r.caught?.title).toBe('Lavender Blanket')
    expect(r.caught?.people).toBe(2)
    expect(r.sentences.some((line) => line.includes('“Lavender Blanket” drew the most attention'))).toBe(true)
  })

  it('a held/unpublished subject is never NAMED (counts historical, names current-visibility-gated)', async () => {
    const w = await makeStore('Rosa Knits')
    const draft = await makeProduct(w, 'Secret Draft', { held: true })
    await view(w, 'product', draft, 'home', uuidv7())
    await view(w, 'product', draft, 'home', uuidv7())
    const r = await receipts(w.businessId)
    expect(r.caught).toBeNull() // the attention happened, but we won't name an unpublished thing
    expect(r.sentences.some((line) => line.includes('Secret Draft'))).toBe(false)
  })

  it('care acts: fires, saves, follows — surfaced honestly; saves counted for the first time', async () => {
    const w = await makeStore('Rosa Knits')
    const p1 = await makeProduct(w, 'Blanket'); const p2 = await makeProduct(w, 'Scarf')
    const mkDeal = async (productId: string) => {
      const id = uuidv7()
      await container.pool.query(
        `INSERT INTO deals (id, business_id, product_id, channel_id, headline, status, published_at) VALUES ($1, $2, $3, $4, 'A deal', 'published', now())`,
        [id, w.businessId, productId, w.storeId])
      return id
    }
    const d1 = await mkDeal(p1); const d2 = await mkDeal(p2)
    await container.pool.query(`INSERT INTO deal_saves (id, deal_id, business_id, visitor_id) VALUES ($1, $2, $3, $4)`, [uuidv7(), d1, w.businessId, uuidv7()])
    await container.pool.query(`INSERT INTO deal_saves (id, deal_id, business_id, visitor_id) VALUES ($1, $2, $3, $4)`, [uuidv7(), d2, w.businessId, uuidv7()])
    await container.pool.query(`INSERT INTO store_follows (id, store_id, business_id, visitor_id) VALUES ($1, $2, $3, $4)`, [uuidv7(), w.storeId, w.businessId, uuidv7()])
    const r = await receipts(w.businessId)
    expect(r.did.saves).toBe(2)
    expect(r.did.follows).toBe(1)
    expect(r.sentences.some((line) => line.includes('2 people saved something') && line.includes('1 person started following'))).toBe(true)
  })

  it('did anyone come back: distinct visitors on ≥2 days', async () => {
    const w = await makeStore('Rosa Knits')
    const loyal = uuidv7()
    await view(w, 'store', w.storeId, 'home', loyal, 0)
    await view(w, 'store', w.storeId, 'home', loyal, 2) // same person, two days
    await view(w, 'store', w.storeId, 'home', uuidv7(), 0) // one-day visitor
    const r = await receipts(w.businessId)
    expect(r.returned).toBe(1)
    expect(r.sentences.some((line) => line.includes('came back on another day'))).toBe(true)
  })
})

describe('LS-7 — privacy, isolation, and honest emptiness', () => {
  it('search phrases are withheld below the k-anonymity threshold, shown at/above it', async () => {
    const w = await makeStore('Rosa Knits')
    const p = await makeProduct(w, 'Lavender Blanket')
    // one phrase reaches the threshold, one stays below
    for (let i = 0; i < SEARCH_MIN_PEOPLE; i++) await searchClick(w, p, 'lavender blanket', uuidv7())
    for (let i = 0; i < SEARCH_MIN_PEOPLE - 1; i++) await searchClick(w, p, 'a rare private phrase', uuidv7())
    const r = await receipts(w.businessId)
    const phrases = r.searches.map((s) => s.phrase)
    expect(phrases).toContain('lavender blanket')
    expect(phrases).not.toContain('a rare private phrase') // one fewer person → withheld
  })

  it('a merchant reads ONLY their own evidence — another shop is invisible', async () => {
    const mine = await makeStore('Rosa Knits')
    const theirs = await makeStore('Rival Co')
    await view(theirs, 'store', theirs.storeId, 'home', uuidv7())
    await view(theirs, 'store', theirs.storeId, 'home', uuidv7())
    const r = await receipts(mine.businessId)
    expect(r.found.people).toBe(0) // their two visitors are not in my receipt
    expect(r.any_attention).toBe(false)
  })

  it('fabricated subjects on my store_id still cannot invent a named thing', async () => {
    const w = await makeStore('Rosa Knits')
    await view(w, 'product', uuidv7(), 'home', uuidv7()) // a product id that does not exist
    const r = await receipts(w.businessId)
    expect(r.found.people).toBe(1)   // the view counted (it hit my store)
    expect(r.caught).toBeNull()      // but nothing nameable → no fabricated title
  })

  it('zero-data merchant: honest empty receipt, no sentences, no fake insight', async () => {
    const w = await makeStore('Brand New Shop')
    const r = await receipts(w.businessId)
    expect(r).toMatchObject({ any_attention: false, found: { people: 0, glances: 0 }, returned: 0, sentences: [] })
    expect(r.caught).toBeNull()
  })
})
