/**
 * PublishableStoreSpec (ADR-001 §5.4) — the minimum bar for going Live, deliberately low:
 * the Five-Minute Store Principle depends on this staying small.
 * The "≥1 published listing" clause activates when Catalog (Module 2) provides a real
 * ListingReadinessPort adapter — see DECISIONS D-03.
 */
import { type Result, ok, err } from '../../../../../shared/result'
import { type DomainError, domainError } from '../../../../../shared/errors'

export interface ListingReadiness {
  /** false until the Catalog module is installed (Module 2). */
  readonly catalogAvailable: boolean
  readonly publishedListingCount: number
}

export interface PublishReadiness {
  readonly name: string
  readonly hasBrandKit: boolean
  readonly hasPolicies: boolean
  readonly listings: ListingReadiness
}

export function checkPublishable(input: PublishReadiness): Result<void, DomainError> {
  const missing: string[] = []
  if (!input.name?.trim()) missing.push('store name')
  if (!input.hasBrandKit) missing.push('brand kit')
  if (!input.hasPolicies) missing.push('store policies (defaults are provided at creation)')
  if (input.listings.catalogAvailable && input.listings.publishedListingCount < 1) {
    missing.push('at least one published listing')
  }
  if (missing.length) {
    return err(domainError('STORE_NOT_PUBLISHABLE', 'store is not ready to publish', { missing }))
  }
  return ok(undefined)
}
