/**
 * TrustPolicyService (ADR-001 §5.3) — the single choke point for "may this business do X
 * at its current trust level / standing?". The command gate consults the same rules;
 * this facade exists so cross-domain callers (Commerce's payout re-check, BLUEPRINT §9
 * defense in depth) and future policies share one implementation.
 */
import { type Result, ok, err } from '../../../../shared/result'
import { type DomainError, domainError } from '../../../../shared/errors'
import type { Business } from '../domain/business'
import {
  type TrustLevel, type Standing,
  meetsTrust, WRITE_BLOCKING_STANDINGS, GROWTH_BLOCKING_STANDINGS,
} from '../../shared-kernel/trust'

export class TrustPolicyService {
  requireStanding(business: Business, blocked: readonly Standing[] = WRITE_BLOCKING_STANDINGS): Result<void, DomainError> {
    if (blocked.includes(business.standing)) {
      return err(domainError('STANDING_BLOCKED', `standing "${business.standing}" blocks this operation`))
    }
    return ok(undefined)
  }

  /** Outward-facing growth ops (publish, offers): restricted standing also blocks (ADR §6). */
  requireGrowthStanding(business: Business): Result<void, DomainError> {
    return this.requireStanding(business, GROWTH_BLOCKING_STANDINGS)
  }

  requireTrust(business: Business, minimum: TrustLevel): Result<void, DomainError> {
    if (!meetsTrust(business.trustLevel, minimum)) {
      return err(domainError('TRUST_LEVEL_REQUIRED', `requires trust level ${minimum}`, { required: minimum, actual: business.trustLevel }))
    }
    return ok(undefined)
  }
}
