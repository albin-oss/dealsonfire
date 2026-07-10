/**
 * Operations location events (BLUEPRINT-003 §4.1; CDC-001 D3; ADR-006 R-2 namespace).
 * Batch 1 registers EXACTLY three events — nothing future (M-6 lock registers only
 * emitted events). Ordering scope (D-19): location facts are business-scoped —
 * L1 (one default per business) is a business-level coordination fact.
 */
import type { Actor } from '../../../merchant/shared-kernel/actor'
import type { NewDomainEvent } from '../../../../platform/events'
import type { LocationKind } from './value-objects'

export type { NewDomainEvent, StoredDomainEvent, TraceContext } from '../../../../platform/events'

export const OPERATIONS_EVENT = {
  LOCATION_CREATED: 'operations.location.created',
  LOCATION_UPDATED: 'operations.location.updated',
  LOCATION_CLOSED: 'operations.location.closed',
} as const

export type LocationCreatedPayload = {
  location_id: string
  business_id: string
  kind: LocationKind
  name: string
  is_default: boolean
  /** System-authored invisible default (the Ghost) vs merchant-created. */
  ghost: boolean
}

export type LocationUpdatedPayload = {
  location_id: string
  business_id: string
  fields_changed: string[]
}

export type LocationClosedPayload = {
  location_id: string
  business_id: string
}

export function makeOperationsEvent<P>(
  eventType: string,
  aggregateType: string,
  aggregateId: string,
  businessId: string,
  actor: Actor,
  payload: P,
  schemaVersion = 1,
): NewDomainEvent<P> {
  return Object.freeze({
    eventType,
    schemaVersion,
    businessId,
    aggregate: { type: aggregateType, id: aggregateId },
    actor,
    payload: Object.freeze(payload),
  })
}

/** Operations ordering scope (D-19): location facts serialize per business. */
export function operationsOrderingScopeOf(event: NewDomainEvent): string {
  if (event.aggregate.type === 'location') return event.businessId ?? event.aggregate.id
  return event.aggregate.id
}
