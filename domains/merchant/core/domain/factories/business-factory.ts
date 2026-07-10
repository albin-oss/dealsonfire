/**
 * BusinessFactory (ADR-001 §5.3): encodes what a valid newborn business is.
 * Every new business starts at the origin of the three axes:
 * unverified / starter / good (Progressive Trust — ADR §0.2).
 */
import { type Result, ok, err } from '../../../../../shared/result'
import { type DomainError, domainError } from '../../../../../shared/errors'
import { newBusinessId } from '../../../shared-kernel/ids'
import type { Actor } from '../../../shared-kernel/actor'
import { Business, type BusinessType } from '../business'
import { EVENT, makeEvent, type NewDomainEvent } from '../events'

export interface NewBusinessResult {
  business: Business
  events: NewDomainEvent[]
}

export function createBusiness(input: {
  displayName: string
  businessType: BusinessType
  actor: Actor
}): Result<NewBusinessResult, DomainError> {
  const name = input.displayName.trim()
  if (!name || name.length > 120) {
    return err(domainError('VALIDATION_FAILED', 'business display name must be 1–120 characters'))
  }
  const business = Business.fromFactory({
    id: newBusinessId(),
    businessType: input.businessType,
    displayName: name,
    profile: {},
    trustLevel: 'unverified',
    scaleTier: 'starter',
    standing: 'good',
    standingContext: {},
    taxSettings: {},
    closedAt: null,
  })
  const events = [makeEvent(
    EVENT.BUSINESS_CREATED,
    { type: 'business', id: business.id },
    business.id,
    input.actor,
    { business_id: business.id, business_type: business.businessType, scale_tier: business.scaleTier, trust_level: business.trustLevel },
  )]
  return ok({ business, events })
}
