/**
 * SV-2 — the maker shapes their store. Attacked.
 *
 * The laws: identity/appearance edits ride the whole-value Brand Kit PUT and reach every
 * public surface live; a logo must belong to the store's own business; the handle is
 * immutable-with-redirect (ADR §11) — old links never 404, old addresses can never be
 * hijacked, chains stay coherent; handle changes are owner-only + step-up + audited, refused
 * under an enforcement hold and on a store on its way out; policy copy is DERIVED truth
 * (the 30-day return promise is DOF's, never merchant free-text); and no settings payload
 * can move lifecycle or enforcement state.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function signIn(): Promise<string> {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `m-${uuidv7()}@maker.example`, password: 'a maker passphrase' } })
  return `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(reg.headers.get('set-cookie')!)![1]!)}`
}

/** A signed-in owner with a live store + one published product. */
async function liveStore(handle: string) {
  const cookie = await signIn()
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: handle } })
  const businessId = biz.body.business_id as string
  const store = await http.request('POST', `/api/v1/businesses/${businessId}/stores`, { headers: { cookie }, body: { name: handle, handle } })
  const storeId = store.body.store_id as string
  await http.request('POST', '/api/v1/products', {
    headers: { cookie },
    body: { business_id: businessId, title: `${handle} thing`, fulfillment_kind: 'physical', default_price: { amount: 2500, currency: 'EUR' }, publish_to_store_id: storeId },
  })
  expect((await http.request('POST', `/api/v1/stores/${storeId}/publish`, { headers: { cookie } })).status).toBe(200)
  return { cookie, businessId, storeId, handle }
}

const getKit = (cookie: string, storeId: string) => http.request('GET', `/api/v1/stores/${storeId}/brand-kit`, { headers: { cookie } })
const putKit = (cookie: string, storeId: string, body: Record<string, unknown>) =>
  http.request('PUT', `/api/v1/stores/${storeId}/brand-kit`, { headers: { cookie, 'idempotency-key': uuidv7() }, body })
const changeHandle = (cookie: string, storeId: string, handle: string) =>
  http.request('POST', `/api/v1/stores/${storeId}/handle`, { headers: { cookie, 'idempotency-key': uuidv7() }, body: { handle } })
const storefront = (handle: string) => http.request('GET', `/api/v1/public/stores/${handle}`)

async function seedMedia(businessId: string, url = 'https://cdn.example/logo.png'): Promise<string> {
  const id = uuidv7()
  await container.pool.query(
    `INSERT INTO media_assets (id, business_id, url, content_type, size_bytes, created_by) VALUES ($1, $2, $3, 'image/png', 4096, $2)`,
    [id, businessId, url])
  return id
}
const handleStatus = async (handle: string) => {
  const { rows } = await container.pool.query<{ status: string; redirect_to_handle: string | null }>(
    `SELECT status, redirect_to_handle FROM store_handles WHERE handle = $1`, [handle])
  return rows[0] ?? null
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('SV-2 — identity & appearance', () => {
  it('owner loads current settings, then a name/palette/logo edit reaches the public storefront', async () => {
    const s = await liveStore('rosa-knits')
    const logoId = await seedMedia(s.businessId, 'https://cdn.example/rosa.png')
    expect((await getKit(s.cookie, s.storeId)).status).toBe(200)
    const put = await putKit(s.cookie, s.storeId, {
      name: 'Rosa Makes', logo_media_id: logoId,
      palette: { primary: '#123456' }, voice: { tone: 'Soft things' },
    })
    expect(put.status).toBe(200)
    const front = await storefront('rosa-knits')
    expect(front.status).toBe(200)
    expect(front.body.brand.name).toBe('Rosa Makes')
    expect(front.body.brand.palette.primary).toBe('#123456')
    expect(front.body.brand.logo_url).toBe('https://cdn.example/rosa.png') // the store card/chrome logo
    expect(front.body.brand.tagline).toBe('Soft things')
  })

  it('a display-name change keeps stores.name in step (workspace and street never disagree)', async () => {
    const s = await liveStore('grain-crumb')
    await putKit(s.cookie, s.storeId, { name: 'Grain & Crumb Bakehouse' })
    const { rows } = await container.pool.query<{ name: string }>(`SELECT name FROM stores WHERE id = $1`, [s.storeId])
    expect(rows[0]!.name).toBe('Grain & Crumb Bakehouse')
    const ws = await http.request('GET', '/api/v1/workspace', { headers: { cookie: s.cookie } })
    expect(ws.body.businesses[0].stores[0].name).toBe('Grain & Crumb Bakehouse')
  })

  it('a logo from another business is refused (cross-tenant guard)', async () => {
    const mine = await liveStore('pixel-paper')
    const theirs = await liveStore('someone-else')
    const theirLogo = await seedMedia(theirs.businessId)
    const put = await putKit(mine.cookie, mine.storeId, { name: 'Pixel & Paper', logo_media_id: theirLogo })
    expect(put.status).toBe(422) // VALIDATION_FAILED — not your media
    // my own media is accepted
    const mineLogo = await seedMedia(mine.businessId)
    expect((await putKit(mine.cookie, mine.storeId, { name: 'Pixel & Paper', logo_media_id: mineLogo })).status).toBe(200)
  })

  it('a non-member cannot edit identity (masked not-found)', async () => {
    const s = await liveStore('mine-shop')
    const stranger = await signIn()
    expect((await putKit(stranger, s.storeId, { name: 'Hijacked' })).status).toBe(404)
    const front = await storefront('mine-shop')
    expect(front.body.brand.name).toBe('mine-shop') // untouched
  })

  it('a settings payload cannot smuggle lifecycle/enforcement fields', async () => {
    const s = await liveStore('strict-shop')
    // extra keys are rejected by the strict brand-kit contract
    const put = await putKit(s.cookie, s.storeId, { name: 'Strict', status: 'closed', enforcement_hold: 'suspended' })
    expect(put.status).toBe(422) // VALIDATION_FAILED — the strict schema refuses unknown keys
    const { rows } = await container.pool.query(`SELECT status, enforcement_hold FROM stores WHERE id = $1`, [s.storeId])
    expect(rows[0]).toMatchObject({ status: 'live', enforcement_hold: 'none' })
  })
})

describe('SV-2 — handle change (identity migration)', () => {
  it('changes the address; the new one serves and the old one redirects to the same store', async () => {
    const s = await liveStore('old-name')
    const res = await changeHandle(s.cookie, s.storeId, 'new-name')
    expect(res.status).toBe(200)
    expect((await storefront('new-name')).status).toBe(200)
    const viaOld = await storefront('old-name')
    expect(viaOld.status).toBe(200) // old link still works
    expect(viaOld.body.store.id).toBe(s.storeId) // …and resolves to the same store
    expect((await handleStatus('old-name'))).toMatchObject({ status: 'redirect', redirect_to_handle: 'new-name' })
  })

  it('an old address can never be hijacked by another merchant', async () => {
    const s = await liveStore('was-mine')
    await changeHandle(s.cookie, s.storeId, 'now-mine')
    // a different merchant tries to claim the freed-looking old handle
    const other = await signIn()
    const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie: other }, body: { business_type: 'individual', display_name: 'other' } })
    const attempt = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie: other }, body: { name: 'grabby', handle: 'was-mine' } })
    expect(attempt.status).toBe(409) // HANDLE_TAKEN — the redirect owns it forever
  })

  it('a sequential A→B→C chain stays coherent — every old address still resolves', async () => {
    const s = await liveStore('handle-a')
    expect((await changeHandle(s.cookie, s.storeId, 'handle-b')).status).toBe(200)
    expect((await changeHandle(s.cookie, s.storeId, 'handle-c')).status).toBe(200)
    for (const h of ['handle-a', 'handle-b', 'handle-c']) {
      const front = await storefront(h)
      expect(front.status).toBe(200)
      expect(front.body.store.id).toBe(s.storeId)
    }
  })

  it('collision, reserved words, and no-op are all refused', async () => {
    const s = await liveStore('claimant')
    await liveStore('taken-shop') // owned by someone else
    expect((await changeHandle(s.cookie, s.storeId, 'taken-shop')).status).toBe(409) // HANDLE_TAKEN
    expect((await changeHandle(s.cookie, s.storeId, 'admin')).status).toBe(409) // reserved word
    expect((await changeHandle(s.cookie, s.storeId, 'claimant')).status).toBe(409) // already your handle
    expect((await storefront('claimant')).status).toBe(200) // unchanged after every refusal
  })

  it('the handle change needs fresh step-up', async () => {
    const s = await liveStore('stepup-addr')
    await container.pool.query(`UPDATE user_sessions SET step_up_at = now() - interval '10 minutes'`)
    expect((await changeHandle(s.cookie, s.storeId, 'stepup-new')).status).toBe(403) // STEP_UP_REQUIRED
    expect((await handleStatus('stepup-addr'))).toMatchObject({ status: 'active' }) // untouched
  })

  it('a held store cannot change its address, and the hold is untouched', async () => {
    const s = await liveStore('held-addr')
    await container.pool.query(`UPDATE stores SET enforcement_hold = 'under_review' WHERE id = $1`, [s.storeId])
    expect((await changeHandle(s.cookie, s.storeId, 'held-new')).status).toBe(423) // ENFORCEMENT_HOLD
    const { rows } = await container.pool.query(`SELECT enforcement_hold, handle FROM stores WHERE id = $1`, [s.storeId])
    expect(rows[0]).toMatchObject({ enforcement_hold: 'under_review', handle: 'held-addr' })
  })

  it('a closed store refuses a handle change; a paused store allows it and stays paused', async () => {
    const closed = await liveStore('closing-addr')
    await http.request('POST', `/api/v1/stores/${closed.storeId}/close`, { headers: { cookie: closed.cookie } })
    expect((await changeHandle(closed.cookie, closed.storeId, 'closing-new')).status).toBe(409) // INVALID_TRANSITION

    const paused = await liveStore('paused-addr')
    await http.request('POST', `/api/v1/stores/${paused.storeId}/pause`, { headers: { cookie: paused.cookie }, body: { reason: 'restocking' } })
    expect((await changeHandle(paused.cookie, paused.storeId, 'paused-new')).status).toBe(200)
    const { rows } = await container.pool.query(`SELECT status, handle FROM stores WHERE id = $1`, [paused.storeId])
    expect(rows[0]).toMatchObject({ status: 'paused', handle: 'paused-new' })
  })

  it('a repeated change converges — exactly one handle_changed event, one truthful state', async () => {
    const s = await liveStore('idem-addr')
    expect((await changeHandle(s.cookie, s.storeId, 'idem-new')).status).toBe(200)
    expect((await changeHandle(s.cookie, s.storeId, 'idem-new')).status).toBe(409) // same handle → no-op refusal
    const { rows } = await container.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM domain_events WHERE event_type = 'merchant.store.handle_changed' AND aggregate_id = $1`, [s.storeId])
    expect(rows[0]!.n).toBe(1)
  })

  it('the handle change is audited with before/after', async () => {
    const s = await liveStore('audit-addr')
    await changeHandle(s.cookie, s.storeId, 'audit-new')
    const { rows } = await container.pool.query<{ before_digest: { handle: string }; after_digest: { handle: string } }>(
      `SELECT before_digest, after_digest FROM audit_logs WHERE command = 'merchant.store.change_handle'`)
    expect(rows[0]!.before_digest.handle).toBe('audit-addr')
    expect(rows[0]!.after_digest.handle).toBe('audit-new')
  })
})

describe('SV-2 — policy is derived truth, not merchant free-text', () => {
  it('the returns promise is DOF’s 30-day standard, served with the shipping terms', async () => {
    const s = await liveStore('promise-shop')
    const shipping = await http.request('GET', `/api/v1/public/stores/${s.handle}/shipping`)
    expect(shipping.status).toBe(200)
    expect(shipping.body.return_window_days).toBe(30) // the one authoritative constant
    // there is no per-store returns field to contradict it: the brand kit rejects one
    expect((await putKit(s.cookie, s.storeId, { name: 'Promise', return_window_days: 90 })).status).toBe(422)
  })
})
