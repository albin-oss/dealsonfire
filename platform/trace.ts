/**
 * Trace threading helpers (ADR-004 C1, D-20) — PLATFORM-generic since IMP-COM-001B (every
 * domain's commands/consumers need them; merchant re-exports for path stability).
 * Correlation enters at the edge (the command wrapper's requestContext.correlation_id);
 * commands stamp it onto the events they append. Event consumers CHAIN: their emitted
 * events inherit the source's correlation and set causation to the source event's id —
 * one request becomes one traceable tree (ADR-003 §4).
 */
import type { TraceContext, StoredDomainEvent } from './events'
import { isUuid } from './uuid'

/**
 * Trace for command-produced events: correlation from the request; no causing event.
 * Defensive: correlation_id is a uuid column — non-UUID context values (legacy callers,
 * tests, external inputs) yield no trace rather than a failed insert.
 */
export function traceFromRequest(requestContext?: Record<string, unknown>): TraceContext | undefined {
  const correlationId = requestContext?.correlation_id
  if (typeof correlationId !== 'string' || !isUuid(correlationId)) return undefined
  return { correlationId }
}

/** Trace for consumer-produced events: inherit correlation, chain causation. */
export function traceFromEvent(source: StoredDomainEvent): TraceContext {
  return {
    correlationId: source.correlationId ?? source.eventId,
    causationId: source.eventId,
  }
}
