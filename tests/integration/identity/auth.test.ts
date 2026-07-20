/**
 * Identity & Sessions — WP-R1-B1 US-1…US-9 over real HTTP + embedded PG, no mocks.
 * Includes the security-relevant battery (enumeration parity, session lifecycle,
 * single-use recovery, hashed-at-rest, claim idempotency) and the session-adapter
 * cookie round-trip that makes resolveAuth('session') real.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const uniqueEmail = () => `u-${uuidv7()}@example.com`
const PW = 'a nice long passphrase'

function cookieFrom(headers: Headers): string | null {
  const setCookie = headers.get('set-cookie')
  if (!setCookie) return null
  const m = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(setCookie)
  return m ? decodeURIComponent(m[1]!) : null
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
  // one limiter + one source IP across the suite — clear windows so per-test budgets are honest
  ;(container.rateLimiter as { reset?: () => void }).reset?.()
  container.identity.emailOutbox!.outbox.length = 0
})

describe('registration (US-1)', () => {
  it('creates a user + session cookie, emits registered, sends a verify email, hashes the password', async () => {
    const email = uniqueEmail()
    const res = await http.request('POST', '/api/v1/auth/register', { body: { email, password: PW, display_name: 'Rosa' } })
    expect(res.status).toBe(201)
    expect(cookieFrom(res.headers)).toBeTruthy()

    // the session cookie resolves to the new user (the adapter spine)
    const token = cookieFrom(res.headers)!
    const resolved = await container.identity.sessions.resolve(token)
    expect(resolved?.userId).toBe(res.body.user_id)
    expect(resolved?.stepUpVerified).toBe(true) // fresh login is step-up-fresh

    // password stored as argon2id, never plaintext
    const { rows } = await container.pool.query(`SELECT password_hash FROM user_credentials`)
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/)
    expect(rows[0].password_hash).not.toContain(PW)

    // registered event + verify email
    const { rows: events } = await container.pool.query(
      `SELECT event_type FROM identity_domain_events WHERE event_type = 'identity.user.registered'`)
    expect(events).toHaveLength(1)
    expect(container.identity.emailOutbox!.outbox.some((m) => m.to === email && m.subject.includes('Confirm'))).toBe(true)

    const { rows: audits } = await container.pool.query(`SELECT command FROM identity_audit_logs`)
    expect(audits.map((a: { command: string }) => a.command)).toContain('identity.user.register')
  })

  it('duplicate email is refused (EMAIL_TAKEN); registration never leaks into other domains’ tables', async () => {
    const email = uniqueEmail()
    await http.request('POST', '/api/v1/auth/register', { body: { email, password: PW } })
    const dup = await http.request('POST', '/api/v1/auth/register', { body: { email, password: PW } })
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe('EMAIL_TAKEN')

    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM domain_events WHERE event_type LIKE 'identity.%'`)
    expect(rows[0].n).toBe(0) // per-domain tables (D-22)
  })

  it('rejects weak/breached passwords with educating copy', async () => {
    const short = await http.request('POST', '/api/v1/auth/register', { body: { email: uniqueEmail(), password: 'short' } })
    expect(short.status).toBe(422)
    const breached = await http.request('POST', '/api/v1/auth/register', { body: { email: uniqueEmail(), password: 'password123' } })
    expect(breached.status).toBe(422)
  })
})

describe('login (US-3) — enumeration-proof', () => {
  it('valid login issues a session; wrong password and unknown email answer identically', async () => {
    const email = uniqueEmail()
    await http.request('POST', '/api/v1/auth/register', { body: { email, password: PW } })

    const good = await http.request('POST', '/api/v1/auth/login', { body: { email, password: PW } })
    expect(good.status).toBe(200)
    expect(cookieFrom(good.headers)).toBeTruthy()

    const wrongPw = await http.request('POST', '/api/v1/auth/login', { body: { email, password: 'wrong but long enough' } })
    const unknown = await http.request('POST', '/api/v1/auth/login', { body: { email: uniqueEmail(), password: 'wrong but long enough' } })
    expect(wrongPw.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrongPw.body.code).toBe(unknown.body.code)
    expect(wrongPw.body.detail).toBe(unknown.body.detail) // identical answer — no enumeration
  })
})

describe('session cookie adapter (the resolveAuth spine, US-9) + logout', () => {
  it('a cookie authenticates GET /session; logout revokes it', async () => {
    const email = uniqueEmail()
    const reg = await http.request('POST', '/api/v1/auth/register', { body: { email, password: PW } })
    const cookie = cookieFrom(reg.headers)!

    const me = await http.request('GET', '/api/v1/auth/session', { headers: { cookie: `${SESSION_COOKIE}=${cookie}` } })
    expect(me.status).toBe(200)
    expect(me.body.email).toBe(email)
    expect(me.body.step_up_verified).toBe(true)

    const out = await http.request('POST', '/api/v1/auth/logout', { headers: { cookie: `${SESSION_COOKIE}=${cookie}` } })
    expect(out.status).toBe(200)

    const after = await http.request('GET', '/api/v1/auth/session', { headers: { cookie: `${SESSION_COOKIE}=${cookie}` } })
    expect(after.status).toBe(401) // revoked
  })

  it('no cookie → 401', async () => {
    expect((await http.request('GET', '/api/v1/auth/session')).status).toBe(401)
  })
})

describe('sign out everywhere (US-4)', () => {
  it('revokes all other sessions and emits revoked_all', async () => {
    const email = uniqueEmail()
    const a = await http.request('POST', '/api/v1/auth/register', { body: { email, password: PW } })
    const cookieA = cookieFrom(a.headers)!
    const b = await http.request('POST', '/api/v1/auth/login', { body: { email, password: PW } })
    const cookieB = cookieFrom(b.headers)!

    // sign out everywhere from session A (keeps A)
    const res = await http.request('POST', '/api/v1/auth/logout-all', { headers: { cookie: `${SESSION_COOKIE}=${cookieA}` } })
    expect(res.status).toBe(200)
    expect(res.body.revoked).toBeGreaterThanOrEqual(1)

    // B is dead, A survives
    expect((await http.request('GET', '/api/v1/auth/session', { headers: { cookie: `${SESSION_COOKIE}=${cookieB}` } })).status).toBe(401)
    expect((await http.request('GET', '/api/v1/auth/session', { headers: { cookie: `${SESSION_COOKIE}=${cookieA}` } })).status).toBe(200)

    const { rows } = await container.pool.query(`SELECT event_type FROM identity_domain_events WHERE event_type = 'identity.session.revoked_all'`)
    expect(rows).toHaveLength(1)
  })
})

describe('step-up (US-5)', () => {
  it('marks the current session step-up-fresh only with the correct password', async () => {
    const email = uniqueEmail()
    const reg = await http.request('POST', '/api/v1/auth/register', { body: { email, password: PW } })
    const cookie = cookieFrom(reg.headers)!
    // age the step-up so it is no longer fresh
    await container.pool.query(`UPDATE user_sessions SET step_up_at = now() - interval '10 minutes'`)

    const wrong = await http.request('POST', '/api/v1/auth/step-up', { headers: { cookie: `${SESSION_COOKIE}=${cookie}` }, body: { password: 'nope but long' } })
    expect(wrong.status).toBe(401)

    const ok = await http.request('POST', '/api/v1/auth/step-up', { headers: { cookie: `${SESSION_COOKIE}=${cookie}` }, body: { password: PW } })
    expect(ok.status).toBe(200)
    const me = await http.request('GET', '/api/v1/auth/session', { headers: { cookie: `${SESSION_COOKIE}=${cookie}` } })
    expect(me.body.step_up_verified).toBe(true)
  })
})

describe('recovery (US-6) — single-use, session-revoking', () => {
  it('request is uniform; reset consumes once and forces re-login', async () => {
    const email = uniqueEmail()
    const reg = await http.request('POST', '/api/v1/auth/register', { body: { email, password: PW } })
    const cookie = cookieFrom(reg.headers)!
    container.identity.emailOutbox!.outbox.length = 0

    // uniform answer whether or not the account exists
    const known = await http.request('POST', '/api/v1/auth/recovery/request', { body: { email } })
    const unknown = await http.request('POST', '/api/v1/auth/recovery/request', { body: { email: uniqueEmail() } })
    expect(known.status).toBe(unknown.status)
    expect(known.body).toEqual(unknown.body)

    const mail = container.identity.emailOutbox!.outbox.find((m) => m.to === email && m.subject.includes('Reset'))
    expect(mail).toBeTruthy()
    const token = /token=([^\s&]+)/.exec(mail!.body)![1]!

    const reset = await http.request('POST', '/api/v1/auth/recovery/reset', { body: { token, password: 'a different long passphrase' } })
    expect(reset.status).toBe(200)

    // sessions revoked (AC-6.2); new password works; token is single-use
    expect((await http.request('GET', '/api/v1/auth/session', { headers: { cookie: `${SESSION_COOKIE}=${cookie}` } })).status).toBe(401)
    expect((await http.request('POST', '/api/v1/auth/login', { body: { email, password: 'a different long passphrase' } })).status).toBe(200)
    const replay = await http.request('POST', '/api/v1/auth/recovery/reset', { body: { token, password: PW } })
    expect(replay.status).toBe(400)
    expect(replay.body.code).toBe('INVALID_TOKEN')
  })

  it('verify-email consumes its token and flips the flag', async () => {
    const email = uniqueEmail()
    await http.request('POST', '/api/v1/auth/register', { body: { email, password: PW } })
    const mail = container.identity.emailOutbox!.outbox.find((m) => m.to === email && m.subject.includes('Confirm'))!
    const token = /token=([^\s&]+)/.exec(mail.body)![1]!
    expect((await http.request('POST', '/api/v1/auth/verify-email', { body: { token } })).status).toBe(200)
    const { rows } = await container.pool.query(`SELECT email_verified FROM users WHERE email = $1`, [email])
    expect(rows[0].email_verified).toBe(true)
    // audit written for the detected change (CAP-R1-ID-002)
    const audit = await container.pool.query(`SELECT command FROM identity_audit_logs WHERE command = 'identity.email.verify'`)
    expect(audit.rows.length).toBe(1)
  })

  it('a verification link is single-use — replay is refused (AC-4)', async () => {
    const email = uniqueEmail()
    await http.request('POST', '/api/v1/auth/register', { body: { email, password: PW } })
    const mail = container.identity.emailOutbox!.outbox.find((m) => m.to === email && m.subject.includes('Confirm'))!
    const token = /token=([^\s&]+)/.exec(mail.body)![1]!
    expect((await http.request('POST', '/api/v1/auth/verify-email', { body: { token } })).status).toBe(200)
    const replay = await http.request('POST', '/api/v1/auth/verify-email', { body: { token } })
    expect(replay.status).toBe(400)
    expect(replay.body.code).toBe('INVALID_TOKEN')
  })

  it('resend issues a fresh link, supersedes the old one, and answers uniformly (AC-5)', async () => {
    const email = uniqueEmail()
    await http.request('POST', '/api/v1/auth/register', { body: { email, password: PW } })
    const first = /token=([^\s&]+)/.exec(
      container.identity.emailOutbox!.outbox.find((m) => m.to === email && m.subject.includes('Confirm'))!.body)![1]!
    container.identity.emailOutbox!.outbox.length = 0

    // resend → uniform 200, a new email with a new token
    const resent = await http.request('POST', '/api/v1/auth/resend-verification', { body: { email } })
    expect(resent.status).toBe(200)
    expect(resent.body).toEqual({ sent: true })
    const second = /token=([^\s&]+)/.exec(
      container.identity.emailOutbox!.outbox.find((m) => m.to === email && m.subject.includes('Confirm'))!.body)![1]!
    expect(second).not.toBe(first)

    // the OLD token is now invalid (superseded); the NEW one verifies
    expect((await http.request('POST', '/api/v1/auth/verify-email', { body: { token: first } })).status).toBe(400)
    expect((await http.request('POST', '/api/v1/auth/verify-email', { body: { token: second } })).status).toBe(200)
  })

  it('resend is enumeration-proof: unknown + already-verified both answer 200 and send nothing', async () => {
    // unknown address → uniform 200, no email
    const unknown = await http.request('POST', '/api/v1/auth/resend-verification', { body: { email: uniqueEmail() } })
    expect(unknown.status).toBe(200)
    expect(container.identity.emailOutbox!.outbox.length).toBe(0)

    // already-verified → uniform 200, no new email (nothing to resend)
    const email = uniqueEmail()
    await http.request('POST', '/api/v1/auth/register', { body: { email, password: PW } })
    const token = /token=([^\s&]+)/.exec(
      container.identity.emailOutbox!.outbox.find((m) => m.to === email && m.subject.includes('Confirm'))!.body)![1]!
    await http.request('POST', '/api/v1/auth/verify-email', { body: { token } })
    container.identity.emailOutbox!.outbox.length = 0
    const afterVerify = await http.request('POST', '/api/v1/auth/resend-verification', { body: { email } })
    expect(afterVerify.status).toBe(200)
    expect(container.identity.emailOutbox!.outbox.length).toBe(0)
  })
})

describe('guest tokens + claims (US-7/8)', () => {
  it('guest token round-trips by scope; claims are idempotent and Ignite-claim registers with source', async () => {
    const orderRef = uuidv7()
    const token = await container.identity.guestClaim.issueGuestToken('order', orderRef)
    const resolved = await container.identity.guestClaim.resolveGuestToken(token)
    expect(resolved).toEqual({ scopeType: 'order', scopeRef: orderRef })
    expect(await container.identity.guestClaim.resolveGuestToken('bogus')).toBeNull()

    // stored hashed
    const { rows } = await container.pool.query(`SELECT token_hash FROM guest_tokens`)
    expect(rows[0].token_hash).not.toBe(token)

    // Ignite claim on registration (US-8): draft attaches, source = ignite_claim
    const draftRef = uuidv7()
    const reg = await http.request('POST', '/api/v1/auth/register', {
      body: { email: uniqueEmail(), password: PW, claim: { type: 'ignite_draft', ref: draftRef } },
    })
    expect(reg.status).toBe(201)
    const { rows: claims } = await container.pool.query(`SELECT user_id FROM identity_claims WHERE claim_ref = $1`, [draftRef])
    expect(claims).toHaveLength(1)
    expect(claims[0].user_id).toBe(reg.body.user_id)
    const { rows: srcEvents } = await container.pool.query(
      `SELECT payload FROM identity_domain_events WHERE aggregate_id = $1`, [reg.body.user_id])
    expect(srcEvents[0].payload.source).toBe('ignite_claim')

    // idempotent second claim
    const again = await container.identity.guestClaim.claim(reg.body.user_id, 'ignite_draft', draftRef)
    expect(again.ok && again.value.outcome).toBe('already')
  })
})

describe('rate limiting (security)', () => {
  it('login throttles by IP after the window budget', async () => {
    const email = uniqueEmail()
    await http.request('POST', '/api/v1/auth/register', { body: { email, password: PW } })
    let limited = false
    for (let i = 0; i < 13; i++) {
      const r = await http.request('POST', '/api/v1/auth/login', { body: { email, password: 'wrong but long' } })
      if (r.status === 429) { limited = true; break }
    }
    expect(limited).toBe(true)
  })
})

describe('remember-me (VERTICAL-001 session experience)', () => {
  it('remember:true → persistent cookie (Max-Age); remember:false → session cookie (no Max-Age)', async () => {
    const email = uniqueEmail()
    await http.request('POST', '/api/v1/auth/register', { body: { email, password: PW, display_name: 'R' } })

    const persistent = await http.request('POST', '/api/v1/auth/login', { body: { email, password: PW, remember: true } })
    expect(persistent.status).toBe(200)
    expect(persistent.headers.get('set-cookie')).toMatch(/Max-Age=/i)

    const ephemeral = await http.request('POST', '/api/v1/auth/login', { body: { email, password: PW, remember: false } })
    expect(ephemeral.status).toBe(200)
    expect(ephemeral.headers.get('set-cookie')).not.toMatch(/Max-Age=/i) // dies with the browser
  })

  it('defaults to persistent when remember is omitted', async () => {
    const email = uniqueEmail()
    await http.request('POST', '/api/v1/auth/register', { body: { email, password: PW, display_name: null } })
    const res = await http.request('POST', '/api/v1/auth/login', { body: { email, password: PW } })
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=/i)
  })
})
