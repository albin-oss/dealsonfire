/**
 * Location aggregate (OPS-001 Batch 1; BLUEPRINT-003 §4.1 L1–L4; ADR-006 §3).
 *
 * Invariants:
 *  L1 — exactly one active default per business. The aggregate's half: only the Ghost
 *       factory mints `isDefault: true`; the DB partial unique index is the big brother.
 *  L2 — a location holding stock cannot close. The aggregate enforces the FACT the
 *       command resolved via StockAtLocationPort (the domain stays pg-free).
 *  L3 — `partner` locations refuse manual stock adjustments (enforced by the Batch-2
 *       AdjustStock command; recorded here as vocabulary via `acceptsManualStock`).
 *  L4 — popup/temporary carry a mandatory operating window and expiry is a warning,
 *       never an auto-close (no behavior here by design).
 *
 * Events follow D-29: updates report DETECTED change; no-ops emit nothing.
 */
import { type Result, ok, err } from '../../../../shared/result'
import { domainError, type DomainError } from '../../../../shared/errors'
import type { Actor } from '../../../merchant/shared-kernel/actor'
import type { LocationId } from '../../shared-kernel/ids'
import {
  OPERATIONS_EVENT, makeOperationsEvent,
  type NewDomainEvent, type LocationCreatedPayload, type LocationUpdatedPayload, type LocationClosedPayload,
} from './events'
import {
  TIME_BOXED_KINDS, createLocationName, addressEquals, operatingWindowEquals,
  type Address, type LocationKind, type LocationStatus, type OperatingWindow,
} from './value-objects'

export interface LocationProps {
  id: LocationId
  businessId: string
  kind: LocationKind
  name: string
  address: Address | null
  pickupInstructions: string | null
  operatingWindow: OperatingWindow | null
  status: LocationStatus
  isDefault: boolean
  /** System-authored (the Ghost) and untouched by a merchant — persisted, never derived
   *  (REVIEW-OPS-001 M-1 / D-39): the first merchant mutation clears it. */
  systemAuthored: boolean
  sequence: number
}

export interface CreateLocationInput {
  id: LocationId
  businessId: string
  kind: LocationKind
  name: string
  address?: Address | null
  pickupInstructions?: string | null
  operatingWindow?: OperatingWindow | null
}

export class Location {
  private pending: NewDomainEvent[] = []

  private constructor(private readonly props: LocationProps) {}

  static rehydrate(props: LocationProps): Location {
    return new Location(props)
  }

  /** Merchant-created location (never default — L1: the Ghost owns the default flag). */
  static create(input: CreateLocationInput, actor: Actor): Result<Location, DomainError> {
    const validated = Location.validateInput(input)
    if (!validated.ok) return validated
    const location = new Location({ ...validated.value, isDefault: false, systemAuthored: false })
    location.emitCreated(actor, false)
    return ok(location)
  }

  /**
   * The Ghost (BLUEPRINT-003 §0.2): the system-authored invisible default that exists so
   * a merchant never meets the word "location" before their second one. Always kind
   * `home`, named after nothing the merchant typed, `isDefault: true` — the only minting
   * path for the flag (L1).
   */
  static createGhost(input: { id: LocationId; businessId: string }, actor: Actor): Location {
    const location = new Location({
      id: input.id,
      businessId: input.businessId,
      kind: 'home',
      name: 'Default location',
      address: null,
      pickupInstructions: null,
      operatingWindow: null,
      status: 'active',
      isDefault: true,
      systemAuthored: true,
      sequence: 0,
    })
    location.emitCreated(actor, true)
    return location
  }

  private static validateInput(input: CreateLocationInput): Result<Omit<LocationProps, 'isDefault' | 'systemAuthored'>, DomainError> {
    const name = createLocationName(input.name)
    if (!name.ok) return name
    if (TIME_BOXED_KINDS.includes(input.kind) && !input.operatingWindow) {
      return err(domainError('VALIDATION_FAILED',
        `a ${input.kind === 'popup' ? 'pop-up' : 'temporary'} location needs its dates — when does it open and close? (L4)`))
    }
    if ((input.pickupInstructions?.length ?? 0) > 500) {
      return err(domainError('VALIDATION_FAILED', 'pickup instructions fit in 500 characters — keep it to what the customer needs at the door'))
    }
    return ok({
      id: input.id,
      businessId: input.businessId,
      kind: input.kind,
      name: name.value,
      address: input.address ?? null,
      pickupInstructions: input.pickupInstructions ?? null,
      operatingWindow: input.operatingWindow ?? null,
      status: 'active',
      sequence: 0,
    })
  }

  get id() { return this.props.id }
  get businessId() { return this.props.businessId }
  get kind() { return this.props.kind }
  get name() { return this.props.name }
  get address() { return this.props.address }
  get pickupInstructions() { return this.props.pickupInstructions }
  get operatingWindow() { return this.props.operatingWindow }
  get status() { return this.props.status }
  get isDefault() { return this.props.isDefault }
  get systemAuthored() { return this.props.systemAuthored }
  get sequence() { return this.props.sequence }

  /** L3 vocabulary: partner stock truth arrives via its adapter, never manual entry. */
  get acceptsManualStock(): boolean {
    return this.props.kind !== 'partner'
  }

  private ensureActive(): Result<void, DomainError> {
    if (this.props.status === 'closed') {
      return err(domainError('INVALID_TRANSITION', 'this location is closed — closed locations are read-only'))
    }
    return ok(undefined)
  }

  /** Detected-change update (D-29): identical values emit nothing. */
  update(
    changes: {
      name?: string
      address?: Address | null
      pickupInstructions?: string | null
      operatingWindow?: OperatingWindow | null
    },
    actor: Actor,
  ): Result<void, DomainError> {
    const active = this.ensureActive()
    if (!active.ok) return active

    const fieldsChanged: string[] = []

    if (changes.name !== undefined) {
      const name = createLocationName(changes.name)
      if (!name.ok) return name
      if (name.value !== this.props.name) {
        this.props.name = name.value
        fieldsChanged.push('name')
      }
    }
    if (changes.address !== undefined && !addressEquals(changes.address, this.props.address)) {
      this.props.address = changes.address
      fieldsChanged.push('address')
    }
    if (changes.pickupInstructions !== undefined) {
      const trimmed = changes.pickupInstructions?.trim() || null
      if ((trimmed?.length ?? 0) > 500) {
        return err(domainError('VALIDATION_FAILED', 'pickup instructions fit in 500 characters — keep it to what the customer needs at the door'))
      }
      if (trimmed !== this.props.pickupInstructions) {
        this.props.pickupInstructions = trimmed
        fieldsChanged.push('pickup_instructions')
      }
    }
    if (changes.operatingWindow !== undefined) {
      if (TIME_BOXED_KINDS.includes(this.props.kind) && changes.operatingWindow === null) {
        return err(domainError('VALIDATION_FAILED', 'a time-boxed location keeps its dates — adjust them instead of removing them (L4)'))
      }
      if (!operatingWindowEquals(changes.operatingWindow, this.props.operatingWindow)) {
        this.props.operatingWindow = changes.operatingWindow
        fieldsChanged.push('operating_window')
      }
    }

    if (fieldsChanged.length === 0) return ok(undefined) // silent no-op (D-29)

    // D-39: the first merchant-authored change ends the Ghost's invisibility claim —
    // a location someone named is a location they know about.
    if (this.props.systemAuthored && actor.type === 'user') {
      this.props.systemAuthored = false
    }

    this.props.sequence += 1
    this.pending.push(makeOperationsEvent<LocationUpdatedPayload>(
      OPERATIONS_EVENT.LOCATION_UPDATED, 'location', this.props.id, this.props.businessId, actor,
      { location_id: this.props.id, business_id: this.props.businessId, fields_changed: fieldsChanged },
    ))
    return ok(undefined)
  }

  /**
   * L2: closing requires the resolved stock fact. The default location additionally
   * refuses to close while it IS the default (L1 would be violated the moment it closed).
   */
  close(hasStock: boolean, actor: Actor): Result<void, DomainError> {
    if (this.props.status === 'closed') return ok(undefined) // idempotent (kernel silent no-op)
    if (this.props.isDefault) {
      return err(domainError('CONFLICT',
        'this is your default location — every business keeps one. Make another location the default first (arrives with multi-location tools).'))
    }
    if (hasStock) {
      return err(domainError('LOCATION_HAS_STOCK',
        'this location still holds stock — transfer or adjust it to zero first, so nothing goes missing on paper (L2)'))
    }
    this.props.status = 'closed'
    this.props.sequence += 1
    this.pending.push(makeOperationsEvent<LocationClosedPayload>(
      OPERATIONS_EVENT.LOCATION_CLOSED, 'location', this.props.id, this.props.businessId, actor,
      { location_id: this.props.id, business_id: this.props.businessId },
    ))
    return ok(undefined)
  }

  private emitCreated(actor: Actor, ghost: boolean): void {
    this.pending.push(makeOperationsEvent<LocationCreatedPayload>(
      OPERATIONS_EVENT.LOCATION_CREATED, 'location', this.props.id, this.props.businessId, actor,
      {
        location_id: this.props.id,
        business_id: this.props.businessId,
        kind: this.props.kind,
        name: this.props.name,
        is_default: this.props.isDefault,
        ghost,
      },
    ))
  }

  pullPendingEvents(): NewDomainEvent[] {
    const events = this.pending
    this.pending = []
    return events
  }
}
