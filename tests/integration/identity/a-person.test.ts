/**
 * C12-3 "A Person, and a Proven Recovery" — the hostile matrix.
 *
 * Attacked as an account-takeover system: token semantics that survive
 * mailbox link-scanners (GET never consumes; POST consumes exactly once;
 * purposes never cross), the email-change state machine (step-up gate,
 * possession proof, enumeration-proof answers, the 72-hour way back that
 * defeats an attacker who changed the password, racing changes converging),
 * guest order keys that authorize exactly one order and nothing else, and
 * consent as append-only facts with deterministic derivation.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import type { SandboxEmailProvider } from '@domains/identity/infrastructure/email'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const inbox = () => (container.identity.emailOutbox as SandboxEmailProvider).outbox
const lastTo = (address: string) => [...inbox()].reverse().find((m) => m.to === address)
const tokenFrom = (body: string, path: string) => {
  const m = new RegExp(`${path}\\?token=([^\\s]+)`).exec(body)
  return m ? decodeURIComponent(m[1]!) : null
}

async function person(email?: string) {
  const addr = email ?? `p-${uuidv7()}@buyer.example`
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: addr, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const me = await http.request('GET', '/api/v1/auth/session', { headers: { cookie } })
  return { email: addr, cookie, userId: me.body.user_id as string }
}

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
  inbox().length = 0
})

// ————————————————————————————— A/B: scanner-safe token semantics

describe('C12-3 — a GET never spends a security token; a POST spends it exactly once', () => {
  it('verification: the API consumes once; replay, expiry, malformed, and cross-purpose all refuse', async () => {
    const p = await person()
    const letter = lastTo(p.email)!
    const token = tokenFrom(letter.body, '/verify')!
    // (the /verify page renders a button and fires nothing on load — pinned in
    // the browser review; here the API-level one-shot law)
    const first = await http.request('POST', '/api/v1/auth/verify-email', { body: { token } })
    expect(first.status).toBe(200)
    const replay = await http.request('POST', '/api/v1/auth/verify-email', { body: { token } })
    expect(replay.status).toBe(400) // consumed — a scanner or attacker replay dies
    const malformed = await http.request('POST', '/api/v1/auth/verify-email', { body: { token: 'not-a-real-token-at-all' } })
    expect(malformed.status).toBe(400)
    // cross-purpose: a RESET token can never verify an email
    await http.request('POST', '/api/v1/auth/recovery/request', { body: { email: p.email } })
    const reset = tokenFrom(lastTo(p.email)!.body, '/reset')!
    const cross = await http.request('POST', '/api/v1/auth/verify-email', { body: { token: reset } })
    expect(cross.status).toBe(400)
    // expiry
    await http.request('POST', '/api/v1/auth/recovery/request', { body: { email: p.email } })
    const reset2 = tokenFrom(lastTo(p.email)!.body, '/reset')!
    await container.pool.query(`UPDATE user_recovery_tokens SET expires_at = now() - interval '1 minute' WHERE consumed_at IS NULL`)
    const expired = await http.request('POST', '/api/v1/auth/recovery/reset', { body: { token: reset2, password: 'another long passphrase' } })
    expect(expired.status).toBe(400)
  })

  it('concurrent confirmations of one token: exactly one success', async () => {
    const p = await person()
    const token = tokenFrom(lastTo(p.email)!.body, '/verify')!
    const results = await Promise.all([
      http.request('POST', '/api/v1/auth/verify-email', { body: { token } }),
      http.request('POST', '/api/v1/auth/verify-email', { body: { token } }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 400])
  })
})

// ————————————————————————————— C: the email-change takeover defense

describe('C12-3 — the email-change state machine', () => {
  it('the full honest journey: step-up gate → possession proof → old-address notice → completion opens the 72h way back', async () => {
    const p = await person()
    // attacker-with-password-but-stale-step-up is refused
    await container.pool.query(`UPDATE user_sessions SET step_up_at = now() - interval '10 minutes'`)
    const stale = await http.request('POST', '/api/v1/account/email-change', { headers: { cookie: p.cookie }, body: { new_email: 'new@buyer.example' } })
    expect(stale.status).toBe(403)
    await container.pool.query(`UPDATE user_sessions SET step_up_at = now()`)

    const req = await http.request('POST', '/api/v1/account/email-change', { headers: { cookie: p.cookie }, body: { new_email: 'new@buyer.example' } })
    expect(req.status).toBe(200)
    expect(lastTo(p.email)!.subject).toMatch(/being changed/) // the old address heard it
    const confirmToken = tokenFrom(lastTo('new@buyer.example')!.body, '/confirm-email-change')!

    const confirm = await http.request('POST', '/api/v1/auth/email-change/confirm', { body: { token: confirmToken } })
    expect(confirm.status).toBe(200)
    const { rows: u } = await container.pool.query(`SELECT email FROM users WHERE id = $1`, [p.userId])
    expect(u[0].email).toBe('new@buyer.example')
    // every session died with the move
    const dead = await http.request('GET', '/api/v1/account', { headers: { cookie: p.cookie } })
    expect(dead.status).toBe(401)
    // the OLD address holds the way back
    expect(lastTo(p.email)!.subject).toMatch(/take it back for 72 hours/)
    // the state machine is the single truth
    const { rows: change } = await container.pool.query(`SELECT state, revert_expires_at FROM email_changes WHERE user_id = $1`, [p.userId])
    expect(change[0].state).toBe('completed')
    expect(new Date(change[0].revert_expires_at).getTime()).toBeGreaterThan(Date.now() + 71 * 3600_000)
  })

  it('the way back defeats the attacker: password changed by the new holder, old address reverts inside 72h → full lockdown', async () => {
    const p = await person()
    await http.request('POST', '/api/v1/account/email-change', { headers: { cookie: p.cookie }, body: { new_email: 'attacker@evil.example' } })
    const confirmToken = tokenFrom(lastTo('attacker@evil.example')!.body, '/confirm-email-change')!
    await http.request('POST', '/api/v1/auth/email-change/confirm', { body: { token: confirmToken } })
    // the attacker (controls the account now) changes the password via recovery to the NEW address
    await http.request('POST', '/api/v1/auth/recovery/request', { body: { email: 'attacker@evil.example' } })
    const attackerReset = tokenFrom(lastTo('attacker@evil.example')!.body, '/reset')!
    const took = await http.request('POST', '/api/v1/auth/recovery/reset', { body: { token: attackerReset, password: 'attacker owns this now 1' } })
    expect(took.status).toBe(200)

    // the rightful owner presses the letter in the OLD inbox
    const revertToken = tokenFrom(lastTo(p.email)!.body, '/undo-email-change')!
    const reverted = await http.request('POST', '/api/v1/auth/email-change/revert', { body: { token: revertToken } })
    expect(reverted.status).toBe(200)
    const { rows: u } = await container.pool.query(`SELECT email FROM users WHERE id = $1`, [p.userId])
    expect(u[0].email).toBe(p.email) // home
    // the attacker's world is gone: sessions revoked, outstanding tokens dead
    const { rows: sessions } = await container.pool.query(
      `SELECT count(*)::int AS n FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL`, [p.userId])
    expect(sessions[0].n).toBe(0)
    const { rows: tokens } = await container.pool.query(
      `SELECT count(*)::int AS n FROM user_recovery_tokens WHERE user_id = $1 AND consumed_at IS NULL AND expires_at > now()`, [p.userId])
    expect(tokens[0].n).toBe(0)
    // revert replay dies; the machine shows 'reverted'
    const replay = await http.request('POST', '/api/v1/auth/email-change/revert', { body: { token: revertToken } })
    expect(replay.status).toBe(400)
    const { rows: change } = await container.pool.query(`SELECT state FROM email_changes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [p.userId])
    expect(change[0].state).toBe('reverted')
  })

  it('after 72 hours the way back closes (uniform refusal)', async () => {
    const p = await person()
    await http.request('POST', '/api/v1/account/email-change', { headers: { cookie: p.cookie }, body: { new_email: 'late@buyer.example' } })
    const confirmToken = tokenFrom(lastTo('late@buyer.example')!.body, '/confirm-email-change')!
    await http.request('POST', '/api/v1/auth/email-change/confirm', { body: { token: confirmToken } })
    const revertToken = tokenFrom(lastTo(p.email)!.body, '/undo-email-change')!
    await container.pool.query(`UPDATE user_recovery_tokens SET expires_at = now() - interval '1 minute' WHERE purpose = 'email_change_revert'`)
    await container.pool.query(`UPDATE email_changes SET revert_expires_at = now() - interval '1 minute'`)
    const late = await http.request('POST', '/api/v1/auth/email-change/revert', { body: { token: revertToken } })
    expect(late.status).toBe(400)
  })

  it('enumeration-proof: a taken address gets the SAME answer; the truth goes to the address; the taken account is untouched', async () => {
    const victim = await person('victim@buyer.example')
    const p = await person()
    const res = await http.request('POST', '/api/v1/account/email-change', { headers: { cookie: p.cookie }, body: { new_email: 'victim@buyer.example' } })
    expect(res.status).toBe(200) // indistinguishable from the claimable case
    expect(lastTo('victim@buyer.example')!.subject).toMatch(/already on a DOF account/)
    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM email_changes WHERE user_id = $1 AND state = 'pending'`, [p.userId])
    expect(rows[0].n).toBe(0) // nothing pending — there is nothing to confirm
    const { rows: v } = await container.pool.query(`SELECT email FROM users WHERE id = $1`, [victim.userId])
    expect(v[0].email).toBe('victim@buyer.example')
  })

  it('racing changes converge: a second request SUPERSEDES the first; the first token dies', async () => {
    const p = await person()
    await http.request('POST', '/api/v1/account/email-change', { headers: { cookie: p.cookie }, body: { new_email: 'first@buyer.example' } })
    const firstToken = tokenFrom(lastTo('first@buyer.example')!.body, '/confirm-email-change')!
    await http.request('POST', '/api/v1/account/email-change', { headers: { cookie: p.cookie }, body: { new_email: 'second@buyer.example' } })
    const stale = await http.request('POST', '/api/v1/auth/email-change/confirm', { body: { token: firstToken } })
    expect(stale.status).toBe(400) // the superseded attempt cannot complete
    const secondToken = tokenFrom(lastTo('second@buyer.example')!.body, '/confirm-email-change')!
    const fresh = await http.request('POST', '/api/v1/auth/email-change/confirm', { body: { token: secondToken } })
    expect(fresh.status).toBe(200)
    const { rows } = await container.pool.query(`SELECT email FROM users WHERE id = $1`, [p.userId])
    expect(rows[0].email).toBe('second@buyer.example')
  })
})

// ————————————————————————————— D: guest order keys

describe('C12-3 — the order key authorizes exactly one order, and nothing else', () => {
  async function guestOrderWorld() {
    // merchant + product + a guest purchase, then the confirmation letter's key
    const m = await person(`maker-${uuidv7()}@maker.example`)
    const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie: m.cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
    const handle = `rosa-${uuidv7().slice(-6)}`
    const store = await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/stores`, { headers: { cookie: m.cookie }, body: { name: 'Rosa Knits', handle } })
    await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: { cookie: m.cookie } })
    const prod = await http.request('POST', '/api/v1/products', {
      headers: { cookie: m.cookie },
      body: { business_id: biz.body.business_id, title: 'Blanket', fulfillment_kind: 'physical', default_price: { amount: 4500, currency: 'EUR' }, publish_to_store_id: store.body.store_id },
    })
    const pub = await http.request('GET', `/api/v1/public/stores/${handle}/products/${prod.body.product_id}`)
    await http.request('POST', `/api/v1/businesses/${biz.body.business_id}/payments/onboarding`, { headers: { cookie: m.cookie }, body: {} })
    await http.request('GET', `/api/v1/businesses/${biz.body.business_id}/payments?sync=1`, { headers: { cookie: m.cookie } })
    const add = await http.request('POST', '/api/v1/public/cart/lines', { body: { variant_id: pub.body.product.variants[0].id, quantity: 1 } })
    const visitorCookie = `dof_visitor=${/dof_visitor=([^;]+)/.exec(add.headers.get('set-cookie') ?? '')![1]}`
    const co = await http.request('POST', '/api/v1/public/checkout', {
      headers: { cookie: visitorCookie },
      body: { attempt_key: uuidv7(), cart_id: add.body.cart_id, contact: { name: 'Guest', email: 'guest@buyer.example' }, delivery: { line1: 'K 1', city: 'A', postal_code: '2000', country: 'BE' } },
    })
    expect(co.body.ok).toBe(true)
    await container.orders.dispatcher.dispatchPending() // journals the confirmation letter + mints the key
    const { rows } = await container.pool.query(
      `SELECT body FROM mail_journal WHERE consumer = 'notify.order-confirmed' AND recipient = 'guest@buyer.example' ORDER BY created_at DESC LIMIT 1`)
    const key = /\?key=([^\s]+)/.exec(rows[0].body)![1]!
    return { orderId: co.body.order_id as string, key: decodeURIComponent(key), visitorCookie, storeId: store.body.store_id as string }
  }

  it('the letter key opens THE order on a cookie-less device; wrong keys and wrong orders stay masked 404', async () => {
    const w = await guestOrderWorld()
    const withKey = await http.request('GET', `/api/v1/public/orders/${w.orderId}?key=${encodeURIComponent(w.key)}`)
    expect(withKey.status).toBe(200) // no cookie, any device — the key is the credential
    expect(withKey.body.order.order_number).toBeTruthy()
    const again = await http.request('GET', `/api/v1/public/orders/${w.orderId}?key=${encodeURIComponent(w.key)}`)
    expect(again.status).toBe(200) // reading is idempotent — replay is the point
    const noKey = await http.request('GET', `/api/v1/public/orders/${w.orderId}`)
    expect(noKey.status).toBe(404)
    const wrongKey = await http.request('GET', `/api/v1/public/orders/${w.orderId}?key=totally-wrong-key-here`)
    expect(wrongKey.status).toBe(404)
    const otherOrder = uuidv7()
    const wrongOrder = await http.request('GET', `/api/v1/public/orders/${otherOrder}?key=${encodeURIComponent(w.key)}`)
    expect(wrongOrder.status).toBe(404) // purpose-bound: this key names ONE order
    // expiry closes the door
    await container.pool.query(`UPDATE guest_tokens SET expires_at = now() - interval '1 minute' WHERE scope_type = 'order'`)
    const expired = await http.request('GET', `/api/v1/public/orders/${w.orderId}?key=${encodeURIComponent(w.key)}`)
    expect(expired.status).toBe(404)
  })

  it('the key grants no identity: no account minted, no other surface opened; a signed-in stranger with the key sees the order, not the buyer', async () => {
    const w = await guestOrderWorld()
    const { rows: before } = await container.pool.query(`SELECT count(*)::int AS n FROM users`)
    await http.request('GET', `/api/v1/public/orders/${w.orderId}?key=${encodeURIComponent(w.key)}`)
    const { rows: after } = await container.pool.query(`SELECT count(*)::int AS n FROM users`)
    expect(after[0].n).toBe(before[0].n) // nothing silently created
    const stranger = await person()
    const asStranger = await http.request('GET', `/api/v1/public/orders/${w.orderId}?key=${encodeURIComponent(w.key)}`, { headers: { cookie: stranger.cookie } })
    expect(asStranger.status).toBe(200) // the LINK authorizes the order — copied links are the holder's risk, bounded to one order
  })
})

// ————————————————————————————— E: consent facts

describe('C12-3 — consent is append-only fact, derivation is deterministic', () => {
  it('registration writes the facts; new facts supersede without rewriting; the account surface derives the latest', async () => {
    const p = await person()
    const { rows: facts } = await container.pool.query(
      `SELECT document_id, action FROM consent_facts WHERE user_id = $1 ORDER BY document_id`, [p.userId])
    expect(facts).toEqual([
      { document_id: 'privacy', action: 'acknowledged' },
      { document_id: 'terms', action: 'accepted' },
    ])
    // history never rewrites: a withdrawal is a NEW fact; derivation follows the latest
    await container.pool.query(
      `INSERT INTO consent_facts (id, user_id, document_id, version, action, surface) VALUES ($1, $2, 'terms', '0-draft-placeholder', 'withdrawn', 'test')`,
      [uuidv7(), p.userId])
    const account = await http.request('GET', '/api/v1/account', { headers: { cookie: p.cookie } })
    const terms = account.body.consents.find((c: { document: string }) => c.document === 'terms')
    expect(terms.action).toBe('withdrawn')
    const { rows: count } = await container.pool.query(`SELECT count(*)::int AS n FROM consent_facts WHERE user_id = $1 AND document_id = 'terms'`, [p.userId])
    expect(count[0].n).toBe(2) // both facts remain — the ledger never forgets
  })
})
