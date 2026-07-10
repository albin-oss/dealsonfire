/**
 * Store aggregate (ADR-001 §5.1, §7) — the sales channel.
 * CONSTITUTIONAL: `status` (merchant intent) and `enforcementHold` (platform enforcement)
 * are orthogonal. A merchant cannot publish through a hold; lifting a hold never
 * un-pauses a merchant's chosen state (ADR §7.2 — rejected as a shared state machine).
 */
import { type Result, ok, err } from '../../../../shared/result'
import { type DomainError, domainError } from '../../../../shared/errors'
import type { BusinessId, StoreId } from '../../shared-kernel/ids'
import type { Handle } from '../../shared-kernel/handle'
import type { Actor } from '../../shared-kernel/actor'
import { type NewDomainEvent, EVENT, makeEvent } from './events'
import { type PublishReadiness, checkPublishable } from './specifications/publishable-store-specification'

export type StoreStatus = 'draft' | 'live' | 'paused' | 'archived' | 'closed' | 'deleted'
export type EnforcementHold = 'none' | 'under_review' | 'suspended'

const STATUS_TRANSITIONS: Record<StoreStatus, StoreStatus[]> = {
  draft: ['live', 'archived'],
  live: ['paused', 'archived'],
  paused: ['live', 'archived'],
  archived: ['closed', 'draft'],
  closed: ['deleted', 'draft'], // reopen within retention window (ADR §7.2)
  deleted: [],
}

export interface StoreProps {
  id: StoreId
  businessId: BusinessId
  handle: Handle
  name: string
  status: StoreStatus
  enforcementHold: EnforcementHold
  pauseContext: Record<string, unknown> | null
  policies: Record<string, unknown>
  completionScore: number
  settings: Record<string, unknown>
  publishedAt: Date | null
}

export class Store {
  private pending: NewDomainEvent[] = []

  private constructor(private readonly props: StoreProps) {}

  static rehydrate(props: StoreProps): Store {
    return new Store(props)
  }
  static fromFactory(props: StoreProps): Store {
    return new Store(props)
  }

  get id() { return this.props.id }
  get businessId() { return this.props.businessId }
  get handle() { return this.props.handle }
  get name() { return this.props.name }
  get status() { return this.props.status }
  get enforcementHold() { return this.props.enforcementHold }
  get pauseContext() { return this.props.pauseContext }
  get policies() { return this.props.policies }
  get completionScore() { return this.props.completionScore }
  get settings() { return this.props.settings }
  get publishedAt() { return this.props.publishedAt }

  private canTransition(to: StoreStatus): boolean {
    return STATUS_TRANSITIONS[this.props.status].includes(to)
  }

  /**
   * Publish (Draft/Paused → Live). Order matters and is contractual:
   * enforcement hold (423) is checked before readiness (409) — a held store must not
   * leak its readiness state, and the hold is the harder fact (BLUEPRINT §4).
   */
  publish(readiness: PublishReadiness, actor: Actor, brandKitSummary: { name: string; palette: Record<string, string> } | null): Result<void, DomainError> {
    if (this.props.enforcementHold !== 'none') {
      return err(domainError('ENFORCEMENT_HOLD', 'store is under a platform enforcement hold'))
    }
    if (this.props.status === 'live') {
      return ok(undefined) // idempotent: publishing a live store is a no-op, not an error
    }
    if (!this.canTransition('live')) {
      return err(domainError('INVALID_TRANSITION', `cannot publish a ${this.props.status} store`))
    }
    const publishable = checkPublishable(readiness)
    if (!publishable.ok) return publishable

    // First publish = the launch moment (store.published — Community celebrates it).
    // Returning from paused = store.resumed (REVIEW-001 M-2): a vacation return is not a launch.
    const first = this.props.publishedAt === null
    this.props.status = 'live'
    this.props.pauseContext = null
    if (first) {
      this.props.publishedAt = new Date()
      this.pending.push(makeEvent(
        EVENT.STORE_PUBLISHED,
        { type: 'store', id: this.props.id },
        this.props.businessId,
        actor,
        { store_id: this.props.id, business_id: this.props.businessId, handle: this.props.handle as string, name: this.props.name, brand_kit: brandKitSummary },
      ))
    } else {
      this.pending.push(makeEvent(
        EVENT.STORE_RESUMED,
        { type: 'store', id: this.props.id },
        this.props.businessId,
        actor,
        { store_id: this.props.id, business_id: this.props.businessId, handle: this.props.handle as string, name: this.props.name },
      ))
    }
    return ok(undefined)
  }

  /** Platform enforcement — actor must be admin/system; merchant roles cannot reach this (gate + aggregate). */
  setEnforcementHold(to: EnforcementHold, reasonCode: string, actor: Actor): Result<void, DomainError> {
    if (actor.type !== 'admin' && actor.type !== 'system') {
      return err(domainError('PERMISSION_DENIED', 'enforcement holds are Administration-only'))
    }
    if (to === this.props.enforcementHold) return ok(undefined)
    const from = this.props.enforcementHold
    this.props.enforcementHold = to
    this.pending.push(makeEvent(
      EVENT.STORE_ENFORCEMENT_HOLD_CHANGED,
      { type: 'store', id: this.props.id },
      this.props.businessId,
      actor,
      { store_id: this.props.id, business_id: this.props.businessId, from, to, reason_code: reasonCode },
    ))
    return ok(undefined)
  }

  pullPendingEvents(): NewDomainEvent[] {
    const events = this.pending
    this.pending = []
    return events
  }
}
