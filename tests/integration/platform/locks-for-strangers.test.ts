/**
 * C12-2 "Locks for Strangers" — the hostile matrix.
 *
 * Under attack: durable rate limits (two instances, one budget; restarts
 * forget nothing; /64 rotation shares a budget; raw IPs never on disk),
 * one-time WebAuthn ceremonies (durable across "restarts", consume-once,
 * expiry, parallel independence, hashed at rest), the abuse intake
 * (info-free answers, dedup per reporter, independent reporters, bounded
 * hostile input), operator enforcement (masked, step-up-gated, audited,
 * EXACT enforcement_hold semantics) — and the binding money proof:
 * an enforcement hold does not touch, pause, or corrupt payout machinery.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { PgRateLimiter, normalizeAddress } from '../../../server/utils/rate-limit'
import { PgChallengeStore, hashChallenge } from '@domains/identity/infrastructure/webauthn'
import { productionGateProblems } from '../../../server/utils/production-gates'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const inTx = <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
  container.deps.uow.withTransaction(fn as never) as Promise<T>

beforeAll(async () => {
  container = newTestContainer()
  setContainer(container)
  http = await startTestApp()
})
afterAll(async () => {
  await http.close(); setContainer(null); await container.shutdown()
})
beforeEach(async () => {
  await truncateAll(container.pool)
  ;(container.rateLimiter as { reset?: () => void }).reset?.()
})

// ————————————————————————————————— durable rate limiting

describe('C12-2 — durable rate limits', () => {
  it('two instances share one budget and concurrent racing cannot undercount', async () => {
    const a = new PgRateLimiter(container.pool, 'test-hmac-secret')
    const b = new PgRateLimiter(container.pool, 'test-hmac-secret')
    const results = await Promise.all(
      Array.from({ length: 14 }, (_, i) => (i % 2 ? a : b).allow('race:key', 10, 60)))
    expect(results.filter(Boolean)).toHaveLength(10) // exactly the budget, across both
    expect(results.filter((r) => !r)).toHaveLength(4)
  })

  it('a restart forgets nothing: a fresh instance sees the spent budget', async () => {
    const before = new PgRateLimiter(container.pool, 'test-hmac-secret')
    for (let i = 0; i < 5; i += 1) await before.allow('restart:key', 5, 60)
    const restarted = new PgRateLimiter(container.pool, 'test-hmac-secret')
    expect(await restarted.allow('restart:key', 5, 60)).toBe(false)
  })

  it('IPv6 rotation inside a /64 shares one budget; a different /64 does not; scopes stay isolated', async () => {
    expect(normalizeAddress('2001:db8:aaaa:bbbb:1:2:3:4')).toBe(normalizeAddress('2001:db8:aaaa:bbbb:ffff:eeee:dddd:cccc'))
    expect(normalizeAddress('2001:db8:aaaa:bbbb::1')).not.toBe(normalizeAddress('2001:db8:aaaa:cccc::1'))
    expect(normalizeAddress('192.0.2.7')).toBe('192.0.2.7') // IPv4 exact
    expect(normalizeAddress('unknown')).toBe('unknown') // malformed/absent stays a stable opaque key
    const limiter = new PgRateLimiter(container.pool, 'test-hmac-secret')
    const key1 = `scope-a:${normalizeAddress('2001:db8:aaaa:bbbb:1:2:3:4')}`
    const key2 = `scope-a:${normalizeAddress('2001:db8:aaaa:bbbb:9:9:9:9')}` // same /64 → same key
    await limiter.allow(key1, 2, 60)
    await limiter.allow(key2, 2, 60)
    expect(await limiter.allow(key1, 2, 60)).toBe(false) // the rotation spent one shared budget
    expect(await limiter.allow(`scope-b:${normalizeAddress('2001:db8:aaaa:bbbb:1:2:3:4')}`, 2, 60)).toBe(true) // other scope untouched
  })

  it('raw addresses never touch disk — only HMAC digests persist', async () => {
    const limiter = new PgRateLimiter(container.pool, 'test-hmac-secret')
    await limiter.allow('probe:192.0.2.55', 10, 60)
    await limiter.allow(`probe:${normalizeAddress('2001:db8:1:2:3:4:5:6')}`, 10, 60)
    const { rows } = await container.pool.query<{ key_hmac: string }>(`SELECT key_hmac FROM rate_limit_buckets`)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.key_hmac).not.toContain('192.0.2.55')
      expect(row.key_hmac).not.toContain('2001:db8')
      expect(row.key_hmac).not.toContain('probe')
    }
  })
})

// ————————————————————————————————— durable one-time WebAuthn ceremonies

describe('C12-2 — WebAuthn ceremonies survive restarts and refuse replays', () => {
  it('options in one "process", verification in another: the ceremony is durable, then consumed exactly once', async () => {
    const processA = new PgChallengeStore(container.pool)
    const user1 = uuidv7()
    await processA.put('ceremony-1', 'the-challenge', user1)
    const processB = new PgChallengeStore(container.pool) // the restart
    const taken = await processB.take('ceremony-1')
    expect(taken).toEqual({ challengeHash: hashChallenge('the-challenge'), userId: user1 })
    expect(await processB.take('ceremony-1')).toBeNull() // replay of a consumed ceremony
    expect(await processA.take('ceremony-1')).toBeNull() // from ANY instance
  })

  it('expiry, parallel independence, wrong ceremony, and the double-submit race', async () => {
    const store = new PgChallengeStore(container.pool)
    await store.put('c-expired', 'x', null)
    await container.pool.query(`UPDATE webauthn_challenges SET expires_at = now() - interval '1 minute' WHERE ceremony_id = 'c-expired'`)
    expect(await store.take('c-expired')).toBeNull()

    await store.put('c-1', 'challenge-1', null)
    const user2 = uuidv7()
    await store.put('c-2', 'challenge-2', user2) // parallel, independent
    expect(await store.take('c-9999')).toBeNull() // wrong ceremony
    expect((await store.take('c-2'))?.userId).toBe(user2)
    expect((await store.take('c-1'))?.challengeHash).toBe(hashChallenge('challenge-1'))

    await store.put('c-race', 'r', null)
    const [first, second] = await Promise.all([store.take('c-race'), store.take('c-race')])
    expect([first, second].filter(Boolean)).toHaveLength(1) // double-submit: exactly one wins
  })

  it('challenges are hashed at rest — the plaintext exists nowhere in the table', async () => {
    const store = new PgChallengeStore(container.pool)
    await store.put('c-hash', 'super-secret-challenge-value', null)
    const { rows } = await container.pool.query<{ challenge_hash: string }>(
      `SELECT challenge_hash FROM webauthn_challenges WHERE ceremony_id = 'c-hash'`)
    expect(rows[0]!.challenge_hash).toBe(hashChallenge('super-secret-challenge-value'))
    expect(rows[0]!.challenge_hash).not.toContain('super-secret')
  })
})

// ————————————————————————————————— production boot gates

describe('C12-2 — the production shape is executable', () => {
  const full: Record<string, string> = {
    NUXT_IDENTITY_MODE: 'session', NUXT_TRUST_PROXY: 'platform',
    NUXT_DATABASE_URL: 'x', NUXT_CRON_SECRET: 'x',
    NUXT_STRIPE_SECRET_KEY: 'x', NUXT_STRIPE_WEBHOOK_SECRET: 'x',
    NUXT_RATE_LIMIT_HMAC_SECRET: 'x',
    NUXT_MAIL_PROVIDER: 'resend', NUXT_RESEND_API_KEY: 'x', NUXT_MAIL_FROM: 'x', NUXT_MAIL_WEBHOOK_SECRET: 'x',
    NUXT_OPS_ALARM_EMAIL: 'x', NUXT_APP_BASE_URL: 'x',
  }
  const env = (overrides: Record<string, string>) => (key: string) => overrides[key] ?? ''

  it('a fully production-shaped configuration passes', () => {
    expect(productionGateProblems(env(full))).toEqual([])
  })

  it('dev identity, undeclared proxy trust, sandbox mail, and missing secrets are each NAMED refusals', () => {
    const problems = productionGateProblems(env({}))
    expect(problems.some((p) => p.includes('NUXT_IDENTITY_MODE'))).toBe(true)
    expect(problems.some((p) => p.includes('NUXT_TRUST_PROXY'))).toBe(true)
    expect(problems.some((p) => p.includes('NUXT_RATE_LIMIT_HMAC_SECRET'))).toBe(true)
    expect(problems.some((p) => p.includes('NUXT_MAIL_PROVIDER'))).toBe(true)
    const single = productionGateProblems(env({ ...full, NUXT_RATE_LIMIT_HMAC_SECRET: '' }))
    expect(single).toEqual(['missing: NUXT_RATE_LIMIT_HMAC_SECRET'])
  })
})

// ————————————————————————————————— abuse intake + operator enforcement

async function merchantWorld(priceMinor = 4500) {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `lk-${uuidv7()}@maker.example`, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  const handle = `rosa-${uuidv7().slice(-6)}`
  const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie }, body: { name: 'Rosa Knits', handle } })
  await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie } })
  const p = await http.request('POST', '/api/v1/products', {
    headers: { cookie },
    body: { business_id: biz.body.business_id, title: 'Blanket', fulfillment_kind: 'physical', default_price: { amount: priceMinor, currency: 'EUR' }, publish_to_store_id: store.body.store_id },
  })
  const pub = await http.request('GET', `/api/v1/public/stores/${handle}/products/${p.body.product_id}`)
  await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/payments/onboarding`, { headers: { cookie }, body: {} })
  await http.request('GET', `/api/v1/businesses/${biz.body.business_id}/payments?sync=1`, { headers: { cookie } })
  return { cookie, businessId: biz.body.business_id as string, storeId: store.body.store_id as string, handle, variantId: pub.body.product.variants[0].id as string }
}

async function operator(): Promise<{ headers: { cookie: string; 'x-dof-step-up': string } }> {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `ops-${uuidv7()}@dof.example`, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const me = await http.request('GET', '/api/v1/auth/session', { headers: { cookie } })
  process.env.NUXT_OPS_USER_IDS = me.body.user_id
  return { headers: { cookie, 'x-dof-step-up': 'true' } }
}

describe('C12-2 — the abuse loop: report → record → operator → decision → enforcement → audit', () => {
  it('reports are info-free, deduped per reporter, independent across reporters, and hostile input stays inert', async () => {
    const m = await merchantWorld()
    const report = { subject_type: 'store', subject_ref: m.storeId, reason: 'counterfeit', note: `'; DROP TABLE stores; --` }
    const r1 = await http.request('POST', '/api/v1/public/report', { body: report })
    expect(r1.status).toBe(200)
    const cookie1 = /dof_visitor=([^;]+)/.exec(r1.headers.get('set-cookie') ?? '')?.[1]
    const dupe = await http.request('POST', '/api/v1/public/report', { headers: { cookie: `dof_visitor=${cookie1}` }, body: report })
    expect(dupe.status).toBe(200) // identical answer — nothing to probe
    const other = await http.request('POST', '/api/v1/public/report', { body: { ...report, note: undefined } })
    expect(other.status).toBe(200) // a different visitor is an independent voice
    const ghost = await http.request('POST', '/api/v1/public/report', { body: { ...report, subject_ref: uuidv7() } })
    expect(ghost.status).toBe(200) // nonexistent subject: same words, no oracle

    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM abuse_reports WHERE subject_ref = $1`, [m.storeId])
    expect(rows[0].n).toBe(2) // dedup held; two humans, two rows
    const { rows: stillThere } = await container.pool.query(`SELECT count(*)::int AS n FROM stores WHERE id = $1`, [m.storeId])
    expect(stillThere[0].n).toBe(1) // the note was data, never SQL

    const oversized = await http.request('POST', '/api/v1/public/report', { body: { ...report, note: 'x'.repeat(1001) } })
    expect(oversized.status).toBe(422)
    const badReason = await http.request('POST', '/api/v1/public/report', { body: { ...report, reason: 'i-just-dislike-it' } })
    expect(badReason.status).toBe(422)
  })

  it('hold: operator-only, step-up-gated, audited; the store VANISHES per existing semantics; lift restores; doubles refuse', async () => {
    const m = await merchantWorld()
    await http.request('POST', '/api/v1/public/report', { body: { subject_type: 'store', subject_ref: m.storeId, reason: 'scam' } })

    // a stranger and a non-step-up operator both fail correctly
    const stranger = await http.request('POST', `/api/v1/ops/stores/${m.storeId}/hold`, { headers: { cookie: m.cookie }, body: { reason: 'nope' } })
    expect(stranger.status).toBe(404) // masked
    const op = await operator()
    // a fresh registration IS a full authentication (step-up window open) — age
    // it past the 5-minute freshness law to prove the enforcement gate refuses
    await container.pool.query(`UPDATE user_sessions SET step_up_at = now() - interval '10 minutes'`)
    const noStepUp = await http.request('POST', `/api/v1/ops/stores/${m.storeId}/hold`, { headers: { cookie: op.headers.cookie }, body: { reason: 'trying' } })
    expect(noStepUp.status).toBe(403)
    await container.pool.query(`UPDATE user_sessions SET step_up_at = now()`) // re-freshen for the rest

    const held = await http.request('POST', `/api/v1/ops/stores/${m.storeId}/hold`, { headers: op.headers, body: { reason: 'counterfeit review' } })
    expect(held.status).toBe(200)
    // EXISTING semantics exactly: masked-404 invisibility, till closed by the same gates
    const publicView = await http.request('GET', `/api/v1/public/stores/${m.handle}`)
    expect(publicView.status).toBe(404)
    const cart = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: m.variantId, quantity: 1 } })
    expect([404, 409, 422]).toContain(cart.status) // the till refuses through existing reads
    // the report resolved with the decision; the audit trail exists; the maker's letter journaled
    const { rows: resolved } = await container.pool.query(`SELECT state, resolution FROM abuse_reports WHERE subject_ref = $1`, [m.storeId])
    expect(resolved[0]).toMatchObject({ state: 'resolved' })
    const { rows: letters } = await container.pool.query(`SELECT consumer, critical FROM mail_journal WHERE consumer = 'ops.store-hold'`)
    expect(letters).toHaveLength(1)
    expect(letters[0]!.critical).toBe(true)
    const { rows: audits } = await container.pool.query(`SELECT count(*)::int AS n FROM audit_logs WHERE command = 'ops.store.hold'`)
    expect(audits[0].n).toBe(1)

    const heldTwice = await http.request('POST', `/api/v1/ops/stores/${m.storeId}/hold`, { headers: op.headers, body: { reason: 'again' } })
    expect(heldTwice.status).toBe(409)

    const released = await http.request('POST', `/api/v1/ops/stores/${m.storeId}/release`, { headers: op.headers, body: { reason: 'review clean' } })
    expect(released.status).toBe(200)
    const back = await http.request('GET', `/api/v1/public/stores/${m.handle}`)
    expect(back.status).toBe(200) // the shop simply returns
    const releasedTwice = await http.request('POST', `/api/v1/ops/stores/${m.storeId}/release`, { headers: op.headers, body: { reason: 'again' } })
    expect(releasedTwice.status).toBe(409)
  })

  it('a standing-policy hold ("suspended") is NOT liftable here — the door refuses honestly', async () => {
    const m = await merchantWorld()
    await container.pool.query(`UPDATE stores SET enforcement_hold = 'suspended' WHERE id = $1`, [m.storeId])
    const op = await operator()
    const lift = await http.request('POST', `/api/v1/ops/stores/${m.storeId}/release`, { headers: op.headers, body: { reason: 'trying' } })
    expect(lift.status).toBe(409)
    expect(JSON.stringify(lift.body)).toMatch(/standing policy/)
  })

  it('BINDING: an enforcement hold does not touch money — a payout in flight completes untouched', async () => {
    const m = await merchantWorld()
    // stage the maker's payable world through the real river (twin provider)
    const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: m.variantId, quantity: 1 } })
    const vCookie = `dof_visitor=${/dof_visitor=([^;]+)/.exec(add.headers.get('set-cookie') ?? '')![1]}`
    const co = await http.request('POST', '/api/v1/public/checkout', {
      headers: { cookie: vCookie },
      body: { attempt_key: uuidv7(), cart_id: add.body.cart_id, contact: { name: 'Jonas', email: 'jonas@buyer.example' }, delivery: { line1: 'K 1', city: 'A', postal_code: '2000', country: 'BE' } },
    })
    expect(co.body.ok).toBe(true)
    await inTx((tx) => container.payments.service.releaseHold(tx as never, { orderId: co.body.order_id, causeKey: `lk:${co.body.order_id}` }))
    const swept = await inTx((tx) => container.payments.service.preparePayoutSweep(tx as never))
    expect(swept.opIds).toHaveLength(1) // the payout op is IN FLIGHT

    const op = await operator()
    const held = await http.request('POST', `/api/v1/ops/stores/${m.storeId}/hold`, { headers: op.headers, body: { reason: 'review while money moves' } })
    expect(held.status).toBe(200)

    for (const opId of swept.opIds) {
      const driven = await container.payments.boundary.drive(opId)
      expect(driven.settled).toBe(true) // the hold froze NOTHING in the money river
    }
    const { rows } = await container.pool.query(
      `SELECT balance_minor::int AS bal FROM ledger_accounts WHERE kind = 'merchant_payable' AND business_id = $1`, [m.businessId])
    expect(rows[0].bal).toBe(0) // paid out, to the cent
    const check = await inTx((tx) => container.payments.service.ledger.recomputeCheck(tx as never))
    expect(check.clean).toBe(true)
  })
})
