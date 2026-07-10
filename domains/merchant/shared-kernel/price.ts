/**
 * Price VO — integer minor units + ISO-4217 code (BLUEPRINT-001 A3). Never a float.
 * In the kernel it is used by BrandKit-free surfaces yet; Catalog (Module 2) is the main consumer.
 */
import { type Result, ok, err } from '../../../shared/result'
import { type DomainError, domainError } from '../../../shared/errors'

const CURRENCY_RE = /^[A-Z]{3}$/

export interface Price {
  readonly amount: number // integer minor units, >= 0
  readonly currency: string // ISO-4217
}

export function createPrice(amount: number, currency: string): Result<Price, DomainError> {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    return err(domainError('VALIDATION_FAILED', 'price.amount must be a non-negative integer of minor units'))
  }
  if (!CURRENCY_RE.test(currency)) {
    return err(domainError('VALIDATION_FAILED', 'price.currency must be an ISO-4217 code'))
  }
  return ok(Object.freeze({ amount, currency }))
}
