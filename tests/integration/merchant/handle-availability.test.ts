/**
 * Handle availability (PROMPT-008 Ignite) over real HTTP + embedded PG. Free handles read
 * available; a claimed store's handle reads taken with suggestions; malformed handles are
 * rejected without a DB hit. Advisory only — the race-safe claim is covered in endpoints.test.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function authed(): Promise<string> {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `h-${uuidv7()}@example.com`, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  return `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('GET /api/v1/handles/:handle/availability', () => {
  it('a free handle is available', async () => {
    const res = await http.request('GET', '/api/v1/handles/rosa-knits/availability', { headers: { cookie: await authed() } })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ handle: 'rosa-knits', available: true, reason: 'ok' })
  })

  it('a claimed handle reads taken with numbered suggestions', async () => {
    const cookie = await authed()
    // claim the handle by creating a business + store through the real kernel
    const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
    await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle: 'rosa-knits' } })

    const res = await http.request('GET', '/api/v1/handles/rosa-knits/availability', { headers: { cookie } })
    expect(res.body.available).toBe(false)
    expect(res.body.reason).toBe('taken')
    expect(res.body.suggestions).toEqual(expect.arrayContaining(['rosa-knits-2']))
  })

  it('a malformed handle is invalid_format (no availability claim)', async () => {
    const res = await http.request('GET', '/api/v1/handles/A_B!/availability', { headers: { cookie: await authed() } })
    expect(res.body).toMatchObject({ available: false, reason: 'invalid_format' })
  })

  it('requires a session', async () => {
    expect((await http.request('GET', '/api/v1/handles/rosa-knits/availability')).status).toBe(401)
  })
})
