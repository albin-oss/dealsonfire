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
export type PauseReason = 'vacation' | 'restocking' | 'personal' | 'other'

/** ADR §7.2: Closed is reversible for 90 days ("grief-proofing"). */
export const CLOSE_RECOVERY_DAYS = 90

/**
 * SV-1 activates the merchant-owned edges of the ADR §7.1 machine. The frozen §7.2
 * decisions are preserved intact (status ⊥ enforcement_hold; paused carries a reason;
 * Closed ≠ Deleted, reversible 90 days). The merchant mental model is OPEN / PAUSED /
 * CLOSED, so `close` is a single verb reaching CLOSED directly from live or paused
 * (ARCHIVED stays the ADR's reserved off-platform waypoint — same public behavior as
 * closed but without the deletion clock — and is not an SV-1 merchant verb). Restore
 * returns CLOSED → LIVE within the recovery window. The §7.1 ASCII diagram's illustrative
 * path is refined, not any §7.2 frozen decision.
 */
const STATUS_TRANSITIONS: Record<StoreStatus, StoreStatus[]> = {
  draft: ['live', 'archived'],
  live: ['paused', 'archived', 'closed'],
  paused: ['live', 'archived', 'closed'],
  archived: ['closed', 'draft'],
  closed: ['live', 'deleted', 'draft'], // restore within the recovery window (ADR §7.2)
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
  closedAt: Date | null
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
  get closedAt() { return this.props.closedAt }
  /** Days left in the 90-day restore window, or null when not closed / already expired. */
  get restoreDaysLeft(): number | null {
    if (this.props.status !== 'closed' || !this.props.closedAt) return null
    const elapsedMs = Date.now() - this.props.closedAt.getTime()
    const left = CLOSE_RECOVERY_DAYS - Math.floor(elapsedMs / 86_400_000)
    return left > 0 ? left : 0
  }

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

  /**
   * Pause (Live → Paused) — a reversible vacation, not a limbo (ADR §7.2). Carries a
   * reason and an optional "back on" note that keeps followers warm. Never touches
   * enforcement or money; a paused store is simply invisible to buyers (status ≠ 'live').
   * Idempotent: pausing an already-paused store is a no-op.
   */
  pause(reason: PauseReason, backOn: string | null, actor: Actor): Result<void, DomainError> {
    if (this.props.status === 'paused') return ok(undefined)
    if (!this.canTransition('paused')) {
      return err(domainError('INVALID_TRANSITION', `cannot pause a ${this.props.status} store`))
    }
    this.props.status = 'paused'
    this.props.pauseContext = { reason, ...(backOn ? { back_on: backOn } : {}) }
    this.pending.push(makeEvent(
      EVENT.STORE_PAUSED,
      { type: 'store', id: this.props.id },
      this.props.businessId,
      actor,
      { store_id: this.props.id, business_id: this.props.businessId, handle: this.props.handle as string, reason, back_on: backOn },
    ))
    return ok(undefined)
  }

  /**
   * Close (Live/Paused → Closed) — a deliberate, confirmed shutdown. The store leaves
   * public discovery immediately (status ≠ 'live'); existing orders, obligations, ledger
   * truth and payouts are UNTOUCHED (that is risk/enforcement machinery, not lifecycle).
   * Closed ≠ Deleted: reversible for CLOSE_RECOVERY_DAYS (ADR §7.2). Idempotent.
   */
  close(actor: Actor): Result<void, DomainError> {
    if (this.props.status === 'closed') return ok(undefined)
    if (!this.canTransition('closed')) {
      return err(domainError('INVALID_TRANSITION', `cannot close a ${this.props.status} store`))
    }
    this.props.status = 'closed'
    this.props.closedAt = new Date()
    this.pending.push(makeEvent(
      EVENT.STORE_CLOSED,
      { type: 'store', id: this.props.id },
      this.props.businessId,
      actor,
      { store_id: this.props.id, business_id: this.props.businessId, handle: this.props.handle as string, closed_at: this.props.closedAt.toISOString() },
    ))
    return ok(undefined)
  }

  /**
   * Restore (Closed → Live) within the recovery window (ADR §7.2 "reopen possible").
   * Past the window the close is final and restore refuses (the store is then eligible
   * for the deletion tombstone — a later, separate concern). A restored store returns
   * live with its history intact; emits STORE_RESUMED (a restore is not a fresh launch).
   */
  restore(actor: Actor): Result<void, DomainError> {
    if (this.props.status !== 'closed') {
      return err(domainError('INVALID_TRANSITION', `only a closed store can be restored`))
    }
    if ((this.restoreDaysLeft ?? 0) <= 0) {
      return err(domainError('CONFLICT', 'the 90-day restore window has passed'))
    }
    this.props.status = 'live'
    this.props.closedAt = null
    this.props.pauseContext = null
    this.pending.push(makeEvent(
      EVENT.STORE_RESUMED,
      { type: 'store', id: this.props.id },
      this.props.businessId,
      actor,
      { store_id: this.props.id, business_id: this.props.businessId, handle: this.props.handle as string, name: this.props.name },
    ))
    return ok(undefined)
  }

  pullPendingEvents(): NewDomainEvent[] {
    const events = this.pending
    this.pending = []
    return events
  }
}
