/**
 * R1-B1-P2 domain-layer unit tests (WP §7). Pure logic only — VOs, the Session model,
 * guest/claim rules, the User aggregate's registration event. No DB, no crypto, no HTTP.
 */
import { describe, it, expect } from 'vitest'
import {
  createEmail, validatePassword, createDisplayName,
  validateOpaqueToken, createClaimReference, validateCredentialReference,
} from '@domains/identity/domain/value-objects'
import {
  Session, SESSION_ROLLING_MS, SESSION_ABSOLUTE_MS, STEP_UP_WINDOW_MS,
} from '@domains/identity/domain/session'
import { createGuestScope, guestExpiryFrom, GUEST_TOKEN_TTL_MS } from '@domains/identity/domain/guest'
import { User } from '@domains/identity/domain/user'
import { IDENTITY_EVENT_PAYLOADS } from '@contracts/schemas/events/identity-payloads'
import { asUserId } from '@domains/identity/shared-kernel/ids'
import { uuidv7 } from '@platform/uuid'

describe('value objects', () => {
  it('email normalizes (trim + lowercase) and rejects malformed', () => {
    expect(createEmail('  Rosa@Example.COM ')).toMatchObject({ ok: true, value: 'rosa@example.com' })
    expect(createEmail('not-an-email').ok).toBe(false)
    expect(createEmail('a@b').ok).toBe(false)
  })

  it('password policy: length floor + breach denylist', () => {
    expect(validatePassword('short').ok).toBe(false)
    expect(validatePassword('password1234').ok).toBe(true)
    expect(validatePassword('password').ok).toBe(false) // on every attacker's list
  })

  it('display name is optional (empty → null), trimmed, and bounded', () => {
    expect(createDisplayName('  Rosa  ')).toMatchObject({ ok: true, value: 'Rosa' })
    expect(createDisplayName('')).toMatchObject({ ok: true, value: null }) // optional
    expect(createDisplayName(null)).toMatchObject({ ok: true, value: null })
    expect(createDisplayName('x'.repeat(81)).ok).toBe(false)
  })

  it('opaque-token shape rejects malformed references (WP §7)', () => {
    const good = 'a'.repeat(40)
    expect(validateOpaqueToken(good)).toMatchObject({ ok: true })
    expect(validateOpaqueToken('short').ok).toBe(false)
    expect(validateOpaqueToken('has spaces in it ' + good).ok).toBe(false)
    expect(validateOpaqueToken('').ok).toBe(false)
    const invalid = validateOpaqueToken('x')
    if (!invalid.ok) expect(invalid.error.code).toBe('INVALID_TOKEN')
  })

  it('claim reference: bounded slug type + opaque ref', () => {
    expect(createClaimReference('ignite_draft', uuidv7())).toMatchObject({ ok: true })
    expect(createClaimReference('Ignite Draft', 'x').ok).toBe(false) // not a slug
    expect(createClaimReference('order', '').ok).toBe(false)
  })

  it('webauthn credential reference: base64url only', () => {
    expect(validateCredentialReference('AQIDBA_-abc').ok).toBe(true)
    expect(validateCredentialReference('has spaces').ok).toBe(false)
    expect(validateCredentialReference('').ok).toBe(false)
  })
})

describe('Session model (US-3/4/5)', () => {
  const base = (over: Partial<Parameters<typeof Session.rehydrate>[0]> = {}) => {
    const now = new Date('2026-07-09T12:00:00Z')
    return Session.rehydrate({
      id: uuidv7(), userId: uuidv7(), stepUpAt: null, createdAt: now,
      rollingExpiresAt: new Date(now.getTime() + SESSION_ROLLING_MS),
      absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
      revokedAt: null, ...over,
    })
  }

  it('active within both windows; expired past rolling; expired past absolute', () => {
    const now = new Date('2026-07-09T12:00:00Z')
    expect(base().isActive(now)).toBe(true)
    expect(base({ rollingExpiresAt: new Date(now.getTime() - 1) }).isActive(now)).toBe(false)
    expect(base({ absoluteExpiresAt: new Date(now.getTime() - 1) }).isActive(now)).toBe(false)
  })

  it('revoked is never active', () => {
    const now = new Date('2026-07-09T12:00:00Z')
    expect(base({ revokedAt: now }).isActive(now)).toBe(false)
  })

  it('step-up is fresh only within the 5-minute window', () => {
    const now = new Date('2026-07-09T12:00:00Z')
    expect(base({ stepUpAt: null }).isStepUpFresh(now)).toBe(false)
    expect(base({ stepUpAt: new Date(now.getTime() - STEP_UP_WINDOW_MS + 1000) }).isStepUpFresh(now)).toBe(true)
    expect(base({ stepUpAt: new Date(now.getTime() - STEP_UP_WINDOW_MS - 1000) }).isStepUpFresh(now)).toBe(false)
  })

  it('rolled expiry is CAPPED at the absolute cutoff (the fix the pure model surfaced)', () => {
    const now = new Date('2026-10-01T12:00:00Z') // 84 days after issue — inside absolute, but +30d would overshoot
    const s = base()
    const rolled = s.rolledExpiry(now)
    expect(rolled.getTime()).toBeLessThanOrEqual(s['props'].absoluteExpiresAt.getTime())
    // early in life the cap doesn't bind — full 30d roll
    const early = new Date('2026-07-10T12:00:00Z')
    expect(base().rolledExpiry(early).getTime()).toBe(early.getTime() + SESSION_ROLLING_MS)
  })

  it('initialExpiry returns the 30d/90d pair', () => {
    const now = new Date('2026-07-09T12:00:00Z')
    const e = Session.initialExpiry(now)
    expect(e.rollingExpiresAt.getTime()).toBe(now.getTime() + SESSION_ROLLING_MS)
    expect(e.absoluteExpiresAt.getTime()).toBe(now.getTime() + SESSION_ABSOLUTE_MS)
  })
})

describe('guest + claim domain', () => {
  it('guest scope validates type slug + ref; expiry is +30d', () => {
    expect(createGuestScope('order', uuidv7())).toMatchObject({ ok: true })
    expect(createGuestScope('BAD TYPE', 'x').ok).toBe(false)
    const now = new Date('2026-07-09T00:00:00Z')
    expect(guestExpiryFrom(now).getTime()).toBe(now.getTime() + GUEST_TOKEN_TTL_MS)
  })
})

describe('User aggregate (US-1)', () => {
  const actor = { type: 'system' as const, id: 'identity.register' }

  it('registration records identity.user.registered with a schema-valid payload', () => {
    const user = User.register(
      { id: asUserId(uuidv7()), email: 'rosa@example.com', displayName: 'Rosa', source: 'direct' }, actor)
    const events = user.pullPendingEvents()
    expect(events).toHaveLength(1)
    expect(events[0]!.eventType).toBe('identity.user.registered')
    expect(events[0]!.payload).toMatchObject({ source: 'direct' })
    const schema = IDENTITY_EVENT_PAYLOADS['identity.user.registered']!
    expect(schema.safeParse(events[0]!.payload).success).toBe(true)
    // events drain — a second pull is empty (D-29 discipline)
    expect(user.pullPendingEvents()).toHaveLength(0)
  })

  it('ignite_claim source is carried on the event (US-8 provenance)', () => {
    const user = User.register(
      { id: asUserId(uuidv7()), email: 'claim@example.com', displayName: null, source: 'ignite_claim' }, actor)
    expect(user.pullPendingEvents()[0]!.payload).toMatchObject({ source: 'ignite_claim' })
  })

  it('verifyEmail is idempotent and eventless (marker only)', () => {
    const user = User.register(
      { id: asUserId(uuidv7()), email: 'v@example.com', displayName: null, source: 'direct' }, actor)
    user.pullPendingEvents()
    user.verifyEmail()
    expect(user.emailVerified).toBe(true)
    user.verifyEmail() // idempotent
    expect(user.pullPendingEvents()).toHaveLength(0)
  })
})
