/**
 * Platform infrastructure ports (BLUEPRINT-002 K1). Framework-free and pg-free by design:
 * domain layers may import these TYPES; the pg-backed implementations live in sibling
 * platform modules that only application/infrastructure layers may touch (boundary-linted).
 */
import type { NewDomainEvent, StoredDomainEvent, TraceContext, PlatformActor } from './events'

/** Opaque transaction handle — resolves to a pg.PoolClient inside platform/db only. */
export type Tx = unknown

export interface UnitOfWork {
  withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>
}

/**
 * Appends events + outbox rows in the SAME transaction as the aggregate change.
 * `trace` stamps correlation/causation (ADR-004 C1); the outbox partition_key is the
 * owner-defined ordering scope supplied at construction (D-19).
 */
export interface EventStore {
  append(tx: Tx, events: NewDomainEvent[], trace?: TraceContext): Promise<StoredDomainEvent[]>
}

export interface AuditEntry {
  businessId: string | null
  actor: PlatformActor
  command: string
  sensitivity: 'normal' | 'sensitive'
  target: Record<string, unknown>
  beforeDigest?: Record<string, unknown>
  afterDigest?: Record<string, unknown>
  context?: Record<string, unknown>
}

export interface AuditLog {
  record(tx: Tx, entry: AuditEntry): Promise<void>
  /** Denied sensitive commands are audited outside any command transaction (D-10). */
  recordDenied(entry: AuditEntry & { denialCode: string }): Promise<void>
}

/** SQL identifiers arriving as configuration are validated, never trusted (defense in depth). */
export function assertSqlIdentifier(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`invalid SQL identifier: ${name}`)
  return name
}
