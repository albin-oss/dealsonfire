/**
 * Location value objects (OPS-001 §2; ADR-006 §3). Validation returns Result — the
 * aggregate and factory never throw for merchant input (Errors Educate lives in the copy).
 */
import { type Result, ok, err } from '../../../../shared/result'
import { domainError, type DomainError } from '../../../../shared/errors'

export const LOCATION_KINDS = ['home', 'store', 'warehouse', 'fulfillment_center', 'partner', 'temporary', 'popup'] as const
export type LocationKind = (typeof LOCATION_KINDS)[number]

export const LOCATION_STATUSES = ['active', 'closed'] as const
export type LocationStatus = (typeof LOCATION_STATUSES)[number]

/** Time-boxed kinds must declare their window (L4's storage half; the DB CHECK is the big brother). */
export const TIME_BOXED_KINDS: readonly LocationKind[] = ['popup', 'temporary']

export interface Address {
  readonly line1: string
  readonly line2: string | null
  readonly city: string
  readonly region: string | null
  readonly postal: string
  readonly country: string // ISO 3166-1 alpha-2
}

export interface OperatingWindow {
  readonly startsAt: Date
  readonly endsAt: Date
  readonly timezone: string
}

export function createLocationName(raw: string): Result<string, DomainError> {
  const name = raw.trim()
  if (name.length < 1 || name.length > 80) {
    return err(domainError('VALIDATION_FAILED', 'give the location a name between 1 and 80 characters — "Garage shelf" works fine'))
  }
  return ok(name)
}

export function createAddress(input: {
  line1: string; line2?: string | null; city: string; region?: string | null; postal: string; country: string
}): Result<Address, DomainError> {
  const line1 = input.line1.trim()
  const city = input.city.trim()
  const postal = input.postal.trim()
  const country = input.country.trim().toUpperCase()
  if (!line1 || !city || !postal) {
    return err(domainError('VALIDATION_FAILED', 'an address needs at least a street line, a city, and a postal code'))
  }
  if (!/^[A-Z]{2}$/.test(country)) {
    return err(domainError('VALIDATION_FAILED', 'country must be a 2-letter code like DE or NL'))
  }
  return ok(Object.freeze({
    line1, line2: input.line2?.trim() || null, city,
    region: input.region?.trim() || null, postal, country,
  }))
}

export function createOperatingWindow(input: { startsAt: Date; endsAt: Date; timezone: string }): Result<OperatingWindow, DomainError> {
  if (Number.isNaN(input.startsAt.getTime()) || Number.isNaN(input.endsAt.getTime())) {
    return err(domainError('VALIDATION_FAILED', 'the operating window needs valid start and end dates'))
  }
  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    return err(domainError('VALIDATION_FAILED', 'the operating window must end after it starts'))
  }
  if (input.timezone.trim() === '') {
    return err(domainError('VALIDATION_FAILED', 'the operating window needs a timezone (like Europe/Amsterdam)'))
  }
  return ok(Object.freeze({ startsAt: input.startsAt, endsAt: input.endsAt, timezone: input.timezone.trim() }))
}

/**
 * Canonical VO equality (REVIEW-OPS-001 H-1 / D-39): PostgreSQL canonicalizes jsonb key
 * order, so JSON.stringify comparison false-positives on round-tripped documents.
 * jsonb-backed VOs compare field-by-field, never by serialization.
 */
export function addressEquals(a: Address | null, b: Address | null): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  return a.line1 === b.line1 && a.line2 === b.line2 && a.city === b.city
    && a.region === b.region && a.postal === b.postal && a.country === b.country
}

export function operatingWindowEquals(a: OperatingWindow | null, b: OperatingWindow | null): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  return a.startsAt.getTime() === b.startsAt.getTime()
    && a.endsAt.getTime() === b.endsAt.getTime()
    && a.timezone === b.timezone
}

