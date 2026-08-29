/**
 * LS-8 — the street is findable, attacked.
 *
 * Laws under fire: the sitemap speaks ONLY the existing visibility law (a
 * held/unpublished/deleted thing never appears, and a hold falls out without
 * any SEO-specific machinery); no token, search, account, or recovery URL is
 * ever an index candidate; malicious merchant text cannot break the XML;
 * empty lanes obey the thinness law; robots protects without pretending to be
 * access control.
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

async function makeProduct(w: { cookie: string; businessId: string; storeId: string }, title: string, publish = true) {
  const r = await http.request('POST', '/api/v1/products', {
    headers: { cookie: w.cookie },
    body: {
      business_id: w.businessId, title, fulfillment_kind: 'physical',
      default_price: { amount: 2500, currency: 'EUR' },
      ...(publish ? { publish_to_store_id: w.storeId } : {}),
    },
  })
  return r.body.product_id as string
}

const sitemap = async () => {
  const r = await http.request('GET', '/sitemap.xml')
  return { status: r.status, xml: String(r.body) }
}

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

describe('LS-8 — the sitemap speaks only the visibility law', () => {
  it('sitemap URLs carry ids only; drafts, held stores, and their products are absent; a NEW hold falls out immediately', async () => {
    const good = await makeStore('Rosa Knits', 'rosa-knits')
    const goodProduct = await makeProduct(good, 'Lavender Blanket')
    const draft = await makeProduct(good, 'Secret Draft', false)
    const held = await makeStore('Zanzibar Curios', 'zanzibar-curios', { hold: true })
    const heldProduct = await makeProduct(held, 'Xylophonic Seashell')

    const s = await sitemap()
    expect(s.xml).toContain(`/s/rosa-knits/p/${goodProduct}`)
    expect(s.xml).not.toContain(draft)
    expect(s.xml).not.toContain('zanzibar-curios')
    expect(s.xml).not.toContain(heldProduct)

    // the hold lands on the good store AFTER it was in the sitemap
    await container.pool.query(`UPDATE stores SET enforcement_hold = 'under_review' WHERE id = $1`, [good.storeId])
    const after = await sitemap()
    expect(after.xml).not.toContain('rosa-knits') // same read, same law — nothing SEO-specific to go stale
  })

  it('no token, search, account, or recovery URL is ever an index candidate; robots protects the same set', async () => {
    await makeStore('Rosa Knits', 'rosa-knits')
    const s = await sitemap()
    for (const banned of ['/search', '?key=', 'token=', '/account', '/verify', '/reset', '/o/', '/cart', '/checkout', '/confirm-email-change', '/undo-email-change', '/legal/']) {
      expect(s.xml, `sitemap leaked ${banned}`).not.toContain(banned)
    }
    const robots = await http.request('GET', '/robots.txt')
    const body = String(robots.body)
    for (const line of ['Disallow: /api/', 'Disallow: /account', 'Disallow: /verify', 'Disallow: /search', 'Sitemap: ']) {
      expect(body).toContain(line)
    }
  })

  it('malicious merchant text cannot break the XML', async () => {
    const evil = await makeStore('Rosa & Sons <script>alert(1)</script>', 'evil-name')
    await makeProduct(evil, 'A "Fine" <Blanket> & More')
    const s = await sitemap()
    expect(s.status).toBe(200)
    expect(s.xml).not.toContain('<script>') // names never enter the XML; URLs are escaped
    expect(s.xml).toContain('/s/evil-name')
  })

  it('empty lanes are absent from the sitemap; populated lanes appear (thinness law)', async () => {
    const w = await makeStore('Rosa Knits', 'rosa-knits')
    await makeProduct(w, 'Lavender Wool Blanket')
    const s = await sitemap()
    expect(s.xml).toContain('/street/soft-wearable') // her words populate this lane
    expect(s.xml).not.toContain('/street/food-drink') // nothing edible on this street yet
    expect(s.xml).toContain('/street/new-shops')      // a store just opened
  })
})
