/**
 * The platform event envelope (ADR-003 §4) — domain-agnostic. Aggregate types and ids are
 * plain strings here; branded types are a DOMAIN concern (domains narrow these shapes via
 * re-export, e.g. merchant's events.ts). One envelope, N domains (BLUEPRINT-002 K1).
 */

export interface AggregateRef {
  readonly type: string
  readonly id: string
}

export interface PlatformActor {
  readonly type: 'user' | 'ai_agent' | 'admin' | 'system'
  readonly id: string
  readonly membershipId?: string
}

export interface NewDomainEvent<P = Record<string, unknown>> {
  readonly eventType: string
  readonly schemaVersion: number
  readonly businessId: string | null
  readonly aggregate: AggregateRef
  readonly actor: PlatformActor
  readonly payload: P
}

export interface StoredDomainEvent<P = Record<string, unknown>> extends NewDomainEvent<P> {
  readonly eventId: string
  readonly sequence: number
  readonly occurredAt: Date
  /** The request/workflow that started it all — enters at the edge (ADR-003 §4). */
  readonly correlationId: string | null
  /** The event/command directly causing this one — consumers chain it (D-20). */
  readonly causationId: string | null
}

/** Stamped at EventStore.append; aggregates stay trace-free (D-20). */
export interface TraceContext {
  correlationId?: string | null
  causationId?: string | null
}

/**
 * Owner-defined ordering scope for outbox partitioning (D-19, ADR-003 W3): each domain
 * supplies its own function at event-store construction. Merchant: business ?? aggregate.
 */
export type OrderingScopeFn = (event: NewDomainEvent) => string
