/** Identity value objects (WP-R1-B1). Validation returns Result — never throws on user input. */
import { type Result, ok, err } from '../../../shared/result'
import { domainError, type DomainError } from '../../../shared/errors'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Normalized email (lowercased, trimmed). citext handles case at the DB; we normalize for events. */
export function createEmail(raw: string): Result<string, DomainError> {
  const email = raw.trim().toLowerCase()
  if (email.length < 3 || email.length > 254 || !EMAIL_RE.test(email)) {
    return err(domainError('VALIDATION_FAILED', 'enter an email address like you@example.com'))
  }
  return ok(email)
}

export function createDisplayName(raw: string | null | undefined): Result<string | null, DomainError> {
  if (raw === null || raw === undefined || raw.trim() === '') return ok(null)
  const name = raw.trim()
  if (name.length > 80) return err(domainError('VALIDATION_FAILED', 'name fits in 80 characters'))
  return ok(name)
}

/** Password policy (AC-1.1): length floor, breach-list deny — composition rules deliberately absent. */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', '1234567890', 'qwertyuiop', 'iloveyou1', 'letmein123',
  'welcome123', 'admin12345', 'password123', 'qwerty12345', 'changeme1',
])

export function validatePassword(raw: string): Result<string, DomainError> {
  if (raw.length < 10) return err(domainError('VALIDATION_FAILED', 'use at least 10 characters — a short sentence works well'))
  if (raw.length > 200) return err(domainError('VALIDATION_FAILED', 'that password is too long (200 characters max)'))
  if (COMMON_PASSWORDS.has(raw.toLowerCase())) {
    return err(domainError('VALIDATION_FAILED', 'that password is on every attacker’s list — pick something only you would think of'))
  }
  return ok(raw)
}

/**
 * Opaque-token shape (SessionToken / RecoveryToken / GuestToken share this VO — they are
 * high-entropy opaque strings; the domain validates SHAPE only, never hashes, never
 * generates — that is the TokenHasher port's job, P0/P3). A malformed reference is
 * rejected here so no garbage reaches the hasher (WP §7 "malformed token references").
 */
export function validateOpaqueToken(raw: string): Result<string, DomainError> {
  const token = raw.trim()
  if (token.length < 20 || token.length > 512 || /\s/.test(token)) {
    return err(domainError('INVALID_TOKEN', 'that link is not valid — request a fresh one'))
  }
  return ok(token)
}

/** ClaimReference: which artifact a user claims. Type is a bounded slug, ref opaque. */
export interface ClaimReference {
  readonly type: string
  readonly ref: string
}
export function createClaimReference(type: string, ref: string): Result<ClaimReference, DomainError> {
  const t = type.trim()
  const r = ref.trim()
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(t)) {
    return err(domainError('VALIDATION_FAILED', 'invalid claim type'))
  }
  if (r.length < 1 || r.length > 200) {
    return err(domainError('VALIDATION_FAILED', 'invalid claim reference'))
  }
  return ok(Object.freeze({ type: t, ref: r }))
}

/** WebAuthnCredentialReference: the authenticator's credential id (base64url). */
export function validateCredentialReference(raw: string): Result<string, DomainError> {
  const id = raw.trim()
  if (id.length < 1 || id.length > 512 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return err(domainError('VALIDATION_FAILED', 'invalid passkey credential reference'))
  }
  return ok(id)
}
