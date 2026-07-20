/**
 * Workspace onboarding progress (CAP-R1-MER-001) over real HTTP + embedded PG.
 * The endpoint composes identity (email verified) with merchant facts and returns the
 * honest ladder. A brand-new account has no merchant record yet — that is a 200 with an
 * honest ladder (Opportunity First), not an error.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp
const uniqueEmail = () => `m-${uuidv7()}@example.com`
const PW = 'a nice long passphrase'

function cookieFrom(headers: Headers): string {
  const set = headers.get('set-cookie')!
  return decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)
}

beforeAll(async () => {
  container = newTestContainer()
  setContainer(container)
  http = await startTestApp()
})
afterAll(async () => {
  await http.close()
  setContainer(null)
  await container.shutdown()
})
beforeEach(async () => {
  await truncateAll(container.pool)
  ;(container.rateLimiter as { reset?: () => void }).reset?.()
  container.identity.emailOutbox!.outbox.length = 0
})

describe('GET /api/v1/workspace/progress', () => {
  it('a freshly registered (unverified) merchant: account done, verify-email is next', async () => {
    const email = uniqueEmail()
    const reg = await http.request('POST', '/api/v1/auth/register', { body: { email, password: PW } })
    const cookie = cookieFrom(reg.headers)

    const res = await http.request('GET', '/api/v1/workspace/progress', { headers: { cookie: `${SESSION_COOKIE}=${cookie}` } })
    expect(res.status).toBe(200)
    expect(res.body.total_count).toBe(8)
    expect(res.body.completed_count).toBe(1) // account_created
    expect(res.body.steps_to_first_sale).toBe(7)
    expect(res.body.next_milestone_id).toBe('email_verified')
    const byId = Object.fromEntries(res.body.milestones.map((m: { id: string; status: string }) => [m.id, m.status]))
    expect(byId.account_created).toBe('done')
    expect(byId.email_verified).toBe('next')
    expect(byId.business_created).toBe('upcoming')
    expect(byId.first_sale).toBe('upcoming')
  })

  it('after verifying email, business_created becomes the next step', async () => {
    const email = uniqueEmail()
    const reg = await http.request('POST', '/api/v1/auth/register', { body: { email, password: PW } })
    const cookie = cookieFrom(reg.headers)
    const token = /token=([^\s&]+)/.exec(
      container.identity.emailOutbox!.outbox.find((m) => m.to === email && m.subject.includes('Confirm'))!.body)![1]!
    await http.request('POST', '/api/v1/auth/verify-email', { body: { token } })

    const res = await http.request('GET', '/api/v1/workspace/progress', { headers: { cookie: `${SESSION_COOKIE}=${cookie}` } })
    expect(res.body.completed_count).toBe(2) // account + email
    expect(res.body.steps_to_first_sale).toBe(6)
    expect(res.body.next_milestone_id).toBe('business_created')
  })

  it('requires a session (unauthenticated → 401)', async () => {
    const res = await http.request('GET', '/api/v1/workspace/progress')
    expect(res.status).toBe(401)
  })
})
