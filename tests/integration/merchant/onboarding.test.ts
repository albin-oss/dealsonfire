/**
 * Guided onboarding (CAP-R1-MER-002) over real HTTP + embedded PG. Save-and-resume,
 * versioning, the live recommendation, completion, and audit — the full discovery vertical.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp
const PW = 'a nice long passphrase'

async function authedUser(): Promise<string> {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `o-${uuidv7()}@example.com`, password: PW } })
  const set = reg.headers.get('set-cookie')!
  return `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => {
  await truncateAll(container.pool)
  ;(container.rateLimiter as { reset?: () => void }).reset?.()
})

describe('GET/PUT/complete /api/v1/onboarding', () => {
  it('starts empty with a general recommendation and the create-business next step', async () => {
    const cookie = await authedUser()
    const res = await http.request('GET', '/api/v1/onboarding', { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('in_progress')
    expect(res.body.answered_count).toBe(0)
    expect(res.body.total_questions).toBe(6)
    expect(res.body.recommendation.suggested_business_type).toBe('general')
    expect(res.body.recommendation.next_step).toBe('create_business')
  })

  it('saves answers (save-and-resume), versions them, and tailors the recommendation', async () => {
    const cookie = await authedUser()
    const put1 = await http.request('PUT', '/api/v1/onboarding', {
      headers: { cookie }, body: { answers: { business_stage: 'starting', sell_types: ['handmade'] } },
    })
    expect(put1.status).toBe(200)
    expect(put1.body.version).toBe(1)
    expect(put1.body.answered_count).toBe(2)
    expect(put1.body.recommendation.suggested_business_type).toBe('maker')
    expect(put1.body.recommendation.recommended_modules).toEqual(expect.arrayContaining(['inventory', 'shipping']))

    // resume: a new request sees persisted answers; an identical patch is a no-op (version steady)
    const same = await http.request('PUT', '/api/v1/onboarding', {
      headers: { cookie }, body: { answers: { business_stage: 'starting' } },
    })
    expect(same.body.version).toBe(1)

    // add a channel → version bumps, marketplace module appears
    const put2 = await http.request('PUT', '/api/v1/onboarding', {
      headers: { cookie }, body: { answers: { channels: ['marketplace'] } },
    })
    expect(put2.body.version).toBe(2)
    expect(put2.body.recommendation.recommended_modules).toContain('marketplace')
  })

  it('rejects invalid answer values (contract)', async () => {
    const cookie = await authedUser()
    const bad = await http.request('PUT', '/api/v1/onboarding', {
      headers: { cookie }, body: { answers: { business_stage: 'unicorn' } },
    })
    expect(bad.status).toBe(422)
    expect(bad.body.code).toBe('VALIDATION_FAILED')
  })

  it('completes discovery, persists status, and writes an audit record', async () => {
    const cookie = await authedUser()
    await http.request('PUT', '/api/v1/onboarding', { headers: { cookie }, body: { answers: { sell_types: ['appointments'] } } })
    const done = await http.request('POST', '/api/v1/onboarding/complete', { headers: { cookie } })
    expect(done.status).toBe(200)
    expect(done.body.status).toBe('completed')
    expect(done.body.completed_at).not.toBeNull()

    const { rows } = await container.pool.query(`SELECT status FROM onboarding_profiles`)
    expect(rows[0].status).toBe('completed')
    const audit = await container.pool.query(`SELECT command FROM audit_logs WHERE command = 'merchant.onboarding.complete'`)
    expect(audit.rows.length).toBe(1)
  })

  it('requires a session (401 unauthenticated)', async () => {
    expect((await http.request('GET', '/api/v1/onboarding')).status).toBe(401)
  })
})
