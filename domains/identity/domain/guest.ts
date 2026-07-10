/**
 * Guest token + claim domain models (P2, WP-R1-B1 US-7/8). PURE: scope shape, expiry,
 * and claim-outcome semantics. Idempotency of a claim is a persistence guarantee (the
 * unique index), which this model NAMES via ClaimOutcome — the domain expresses that a
 * repeat claim of the same artifact is a no-op success, not an error.
 */
import { type Result, ok, err } from '../../../shared/result'
import { domainError, type DomainError } from '../../../shared/errors'

export const GUEST_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface GuestScope {
  readonly type: string
  readonly ref: string
}

export function createGuestScope(type: string, ref: string): Result<GuestScope, DomainError> {
  const t = type.trim()
  const r = ref.trim()
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(t)) return err(domainError('VALIDATION_FAILED', 'invalid guest scope type'))
  if (r.length < 1 || r.length > 200) return err(domainError('VALIDATION_FAILED', 'invalid guest scope reference'))
  return ok(Object.freeze({ type: t, ref: r }))
}

export function guestExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + GUEST_TOKEN_TTL_MS)
}

/** The two honest outcomes of a claim (idempotency made explicit). */
export type ClaimOutcome = 'claimed' | 'already'
