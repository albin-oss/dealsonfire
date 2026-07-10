/**
 * Parameterized outbox dispatcher (BLUEPRINT-002 K1) — one instance per producing domain.
 * Semantics unchanged from Module 1: partition-serial claiming by DB `seq` (D-15),
 * payload validation with immediate dead-lettering (M-6), event_deliveries insert-or-skip
 * idempotency, exponential backoff, dead after 10. Housekeeping SQL is owner-supplied
 * (e.g. merchant's audit-partition maintenance).
 */
import type pg from 'pg'
import type { Tx } from './types'
import { assertSqlIdentifier } from './types'
import type { StoredDomainEvent, PlatformActor } from './events'
import type { PayloadValidator } from '../shared/validation'

export interface OutboxConsumer {
  consumer: string
  eventTypes: string[]
  handle(tx: Tx, event: StoredDomainEvent): Promise<void>
}

export interface DispatcherTables {
  outboxTable: string
  eventsTable: string
  deliveriesTable: string
  /** Owner-supplied statements run with housekeeping (partition upkeep etc.). */
  housekeepingSql?: string[]
}

/** Retry/DLQ policy (IMP-PLT-001). Defaults reproduce Module 1 behavior exactly. */
export interface RetryStrategy {
  maxAttempts: number
  backoffSeconds(attempts: number): number
}

export const DEFAULT_RETRY: RetryStrategy = {
  maxAttempts: 10,
  backoffSeconds: (attempts) => Math.min(2 ** attempts, 3600),
}

export interface DispatcherOptions {
  retry?: RetryStrategy
  /** Error sink; defaults to console.error (Module 1 behavior). */
  logError?: (message: string) => void
}

const BATCH_LIMIT = 50

interface ClaimRow {
  outbox_id: string
  attempts: number
  event_id: string
  business_id: string | null
  aggregate_type: string
  aggregate_id: string
  sequence: string
  event_type: string
  schema_version: number
  payload: Record<string, unknown>
  actor: PlatformActor
  occurred_at: Date
  correlation_id: string | null
  causation_id: string | null
}

export class OutboxDispatcher {
  private readonly t: Required<Pick<DispatcherTables, 'outboxTable' | 'eventsTable' | 'deliveriesTable'>>
  private readonly housekeepingSql: string[]
  private readonly retry: RetryStrategy
  private readonly logError: (message: string) => void

  constructor(
    private readonly pool: pg.Pool,
    tables: DispatcherTables,
    private readonly consumers: OutboxConsumer[],
    private readonly payloadValidators: Record<string, PayloadValidator> = {},
    options: DispatcherOptions = {},
  ) {
    this.t = {
      outboxTable: assertSqlIdentifier(tables.outboxTable),
      eventsTable: assertSqlIdentifier(tables.eventsTable),
      deliveriesTable: assertSqlIdentifier(tables.deliveriesTable),
    }
    this.housekeepingSql = tables.housekeepingSql ?? []
    this.retry = options.retry ?? DEFAULT_RETRY
    this.logError = options.logError ?? ((message) => console.error(message))
  }

  /** Process up to `limit` pending outbox rows; each row in its own transaction. */
  async dispatchPending(limit = BATCH_LIMIT): Promise<{ dispatched: number; failed: number }> {
    let dispatched = 0
    let failed = 0
    for (let i = 0; i < limit; i++) {
      const outcome = await this.dispatchOne()
      if (outcome === 'empty') break
      if (outcome === 'ok') dispatched++
      else failed++
    }
    return { dispatched, failed }
  }

  private async dispatchOne(): Promise<'ok' | 'failed' | 'empty'> {
    const client = await this.pool.connect()
    let claimed: ClaimRow | undefined
    try {
      await client.query('BEGIN')
      // Partition-serial claim (D-15): only the oldest pending row of each partition is
      // claimable; ordering key is the DB-assigned `seq`, never the uuid (UUIDv7 is not
      // monotonic within one millisecond).
      const { rows } = await client.query<ClaimRow>(
        `SELECT o.id AS outbox_id, o.attempts,
                e.id AS event_id, e.business_id, e.aggregate_type, e.aggregate_id, e.sequence::text,
                e.event_type, e.schema_version, e.payload, e.actor, e.occurred_at,
                e.correlation_id, e.causation_id
         FROM ${this.t.outboxTable} o
         JOIN ${this.t.eventsTable} e ON e.id = o.domain_event_id
         WHERE o.status = 'pending' AND o.next_attempt_at <= now()
           AND NOT EXISTS (
             SELECT 1 FROM ${this.t.outboxTable} x
             WHERE x.partition_key = o.partition_key AND x.status = 'pending' AND x.seq < o.seq
           )
         ORDER BY o.partition_key, o.seq
         LIMIT 1
         FOR UPDATE OF o SKIP LOCKED`,
      )
      claimed = rows[0]
      if (!claimed) {
        await client.query('ROLLBACK')
        return 'empty'
      }

      // M-6: known payloads validated before consumers; invalid = dead immediately.
      const validator = this.payloadValidators[claimed.event_type]
      if (validator) {
        const validation = validator(claimed.payload)
        if (!validation.ok) {
          await client.query(`UPDATE ${this.t.outboxTable} SET status = 'dead' WHERE id = $1`, [claimed.outbox_id])
          await client.query('COMMIT')
          this.logError(`[outbox] event ${claimed.event_id} (${claimed.event_type}) dead: invalid payload — ${validation.message}`)
          return 'failed'
        }
      }

      const event: StoredDomainEvent = {
        eventId: claimed.event_id,
        eventType: claimed.event_type,
        schemaVersion: claimed.schema_version,
        businessId: claimed.business_id,
        aggregate: { type: claimed.aggregate_type, id: claimed.aggregate_id },
        sequence: Number(claimed.sequence),
        actor: claimed.actor,
        payload: claimed.payload,
        occurredAt: claimed.occurred_at,
        correlationId: claimed.correlation_id,
        causationId: claimed.causation_id,
      }

      for (const consumer of this.consumers) {
        if (!consumer.eventTypes.includes(event.eventType)) continue
        const delivery = await client.query(
          `INSERT INTO ${this.t.deliveriesTable} (consumer, event_id) VALUES ($1, $2)
           ON CONFLICT (consumer, event_id) DO NOTHING RETURNING consumer`,
          [consumer.consumer, event.eventId],
        )
        if (delivery.rows.length === 0) continue // already effected — skip
        await consumer.handle(client, event)
      }

      await client.query(
        `UPDATE ${this.t.outboxTable} SET status = 'dispatched', dispatched_at = now() WHERE id = $1`,
        [claimed.outbox_id],
      )
      await client.query('COMMIT')
      return 'ok'
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      if (claimed) {
        const attempts = claimed.attempts + 1
        const dead = attempts >= this.retry.maxAttempts
        const backoffSeconds = this.retry.backoffSeconds(attempts)
        await this.pool
          .query(
            `UPDATE ${this.t.outboxTable}
             SET attempts = $2, status = $3, next_attempt_at = now() + ($4 || ' seconds')::interval
             WHERE id = $1`,
            [claimed.outbox_id, attempts, dead ? 'dead' : 'pending', String(backoffSeconds)],
          )
          .catch(() => {})
        if (dead) {
          this.logError(`[outbox] event ${claimed.event_id} moved to dead after ${attempts} attempts: ${(error as Error).message}`)
        }
      }
      return 'failed'
    } finally {
      client.release()
    }
  }

  /** Purge old dispatched rows + run owner-supplied upkeep (e.g. audit partitions). */
  async housekeeping(): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.t.outboxTable} WHERE status = 'dispatched' AND dispatched_at < now() - interval '7 days'`)
    for (const sql of this.housekeepingSql) {
      await this.pool.query(sql)
    }
  }
}
