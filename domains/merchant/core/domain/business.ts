/**
 * Business aggregate (ADR-001 §5.1) — the economic entity on three orthogonal axes.
 * Standing may only be worsened by Administration commands or audited automated policy;
 * this aggregate enforces the actor rule itself (defense in depth).
 */
import { type Result, ok, err } from '../../../../shared/result'
import { type DomainError, domainError } from '../../../../shared/errors'
import type { BusinessId } from '../../shared-kernel/ids'
import type { Actor } from '../../shared-kernel/actor'
import { type TrustLevel, type ScaleTier, type Standing, TRUST_LEVELS } from '../../shared-kernel/trust'
import { type NewDomainEvent, EVENT, makeEvent } from './events'

export type BusinessType = 'individual' | 'registered'

export interface BusinessProps {
  id: BusinessId
  businessType: BusinessType
  displayName: string
  profile: Record<string, unknown>
  trustLevel: TrustLevel
  scaleTier: ScaleTier
  standing: Standing
  standingContext: Record<string, unknown>
  taxSettings: Record<string, unknown>
  closedAt: Date | null
}

export class Business {
  private pending: NewDomainEvent[] = []

  private constructor(private readonly props: BusinessProps) {}

  /** Construction happens through BusinessFactory (encodes what a valid newborn business is). */
  static rehydrate(props: BusinessProps): Business {
    return new Business(props)
  }
  static fromFactory(props: BusinessProps): Business {
    return new Business(props)
  }

  get id() { return this.props.id }
  get businessType() { return this.props.businessType }
  get displayName() { return this.props.displayName }
  get profile() { return this.props.profile }
  get trustLevel() { return this.props.trustLevel }
  get scaleTier() { return this.props.scaleTier }
  get standing() { return this.props.standing }
  get standingContext() { return this.props.standingContext }
  get taxSettings() { return this.props.taxSettings }
  get closedAt() { return this.props.closedAt }

  get isOpen(): boolean {
    return this.props.closedAt === null
  }

  /** Only Administration/automated policy actors may change standing (ADR-001 §6, §15). */
  changeStanding(to: Standing, reasonCode: string, actor: Actor): Result<void, DomainError> {
    if (actor.type !== 'admin' && actor.type !== 'system') {
      return err(domainError('PERMISSION_DENIED', 'standing may only be changed by Administration or platform policy'))
    }
    if (to === this.props.standing) return ok(undefined)
    const from = this.props.standing
    this.props.standing = to
    this.props.standingContext = { reason_code: reasonCode, actor: { type: actor.type, id: actor.id }, since: new Date().toISOString() }
    this.pending.push(makeEvent(
      EVENT.BUSINESS_STANDING_CHANGED,
      { type: 'business', id: this.props.id },
      this.props.id,
      actor,
      { business_id: this.props.id, from, to, reason_code: reasonCode },
    ))
    return ok(undefined)
  }

  /** Trust levels are raised one step at a time by approved VerificationCases; never skipped (ADR §10). */
  raiseTrustLevel(to: TrustLevel, actor: Actor): Result<void, DomainError> {
    const currentIdx = TRUST_LEVELS.indexOf(this.props.trustLevel)
    const nextIdx = TRUST_LEVELS.indexOf(to)
    if (nextIdx !== currentIdx + 1) {
      return err(domainError('INVALID_TRANSITION', `trust level can only advance one step (${this.props.trustLevel} → ${to})`))
    }
    const from = this.props.trustLevel
    this.props.trustLevel = to
    this.pending.push(makeEvent(
      EVENT.BUSINESS_TRUST_LEVEL_RAISED,
      { type: 'business', id: this.props.id },
      this.props.id,
      actor,
      { business_id: this.props.id, from, to },
    ))
    return ok(undefined)
  }

  pullPendingEvents(): NewDomainEvent[] {
    const events = this.pending
    this.pending = []
    return events
  }
}
