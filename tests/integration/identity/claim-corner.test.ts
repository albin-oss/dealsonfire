/**
 * Keep your corner (Release 1.3) over real HTTP + embedded PG. Continuity, not account
 * ceremony: registering with a browsing identity present claims it (follows/saves and
 * all), logging in anywhere restores it, and a corner belongs to exactly one person
 * (the identity_claims unique law). Zero new endpoints — register/login ARE the journey.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function liveStore(): Promise<{ handle: string }> {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `s-${uuidv7()}@example.com`, password: 'a long passphrase' } })
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(reg.headers.get('set-cookie')!)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle } })
  await http.request('POST', '/api/v1/products', {
    headers: { cookie },
    body: { business_id: biz.body.business_id, title: 'Blanket', fulfillment_kind: 'physical', default_price: { amount: 4500, currency: 'EUR' }, publish_to_store_id: store.body.store_id },
  })
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
  return { handle }
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('keep your corner (Release 1.3)', () => {
  it('registering with a corner underfoot keeps it; login restores it on any device', async () => {
    const store = await liveStore()

    // a visitor builds a corner: one follow
    const follow = await http.request('POST', `/api/v1/public/stores/${store.handle}/follow`)
    const visitorId = /dof_visitor=([^;]+)/.exec(follow.headers.get('set-cookie') ?? '')![1]!
    const visitorCookie = `dof_visitor=${visitorId}`

    // before keeping: home says the corner is not kept
    const before = await http.request('GET', '/api/v1/public/home', { headers: { cookie: visitorCookie } })
    expect(before.body.corner_kept).toBe(false)

    // registration WITH the corner underfoot claims it and reports what was preserved
    const email = `keeper-${uuidv7()}@example.com`
    const reg = await http.request('POST', '/api/v1/auth/register', {
      headers: { cookie: visitorCookie },
      body: { email, password: 'a long passphrase' },
    })
    expect(reg.status).toBe(201)
    expect(reg.body.corner).toEqual({ merchants: 1, saved: 0 })

    // home now knows the corner is kept (the prompt retires)
    const after = await http.request('GET', '/api/v1/public/home', { headers: { cookie: visitorCookie } })
    expect(after.body.corner_kept).toBe(true)

    // a NEW device (no visitor cookie): login restores the corner
    const login = await http.request('POST', '/api/v1/auth/login', { body: { email, password: 'a long passphrase' } })
    expect(login.body.corner_restored).toBe(true)
    const restored = /dof_visitor=([^;]+)/.exec(login.headers.get('set-cookie') ?? '')?.[1]
    expect(restored).toBe(visitorId)

    // …and the restored identity carries the possession
    const home = await http.request('GET', '/api/v1/public/home?filter=following', { headers: { cookie: `dof_visitor=${restored}` } })
    expect(home.body.my_merchants.map((m: { handle: string }) => m.handle)).toEqual([store.handle])
  })

  it('a corner belongs to exactly one person; an unclaimed one is claimed at login', async () => {
    const store = await liveStore()
    const follow = await http.request('POST', `/api/v1/public/stores/${store.handle}/follow`)
    const visitorCookie = `dof_visitor=${/dof_visitor=([^;]+)/.exec(follow.headers.get('set-cookie') ?? '')![1]}`

    // first keeper wins
    await http.request('POST', '/api/v1/auth/register', {
      headers: { cookie: visitorCookie }, body: { email: `a-${uuidv7()}@example.com`, password: 'a long passphrase' },
    })
    // a second person registering on the same browser does NOT steal the corner
    const thief = await http.request('POST', '/api/v1/auth/register', {
      headers: { cookie: visitorCookie }, body: { email: `b-${uuidv7()}@example.com`, password: 'a long passphrase' },
    })
    expect(thief.status).toBe(201)
    expect(thief.body.corner).toBeNull()

    // an existing user logging in where an UNCLAIMED corner sits claims it
    const email = `c-${uuidv7()}@example.com`
    await http.request('POST', '/api/v1/auth/register', { body: { email, password: 'a long passphrase' } })
    const stray = await http.request('POST', `/api/v1/public/stores/${store.handle}/follow`)
    const strayCookie = `dof_visitor=${/dof_visitor=([^;]+)/.exec(stray.headers.get('set-cookie') ?? '')![1]}`
    const login = await http.request('POST', '/api/v1/auth/login', {
      headers: { cookie: strayCookie }, body: { email, password: 'a long passphrase' },
    })
    expect(login.body.corner_restored).toBe(true)
  })
})
