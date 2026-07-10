/**
 * Event replay (IMP-PLT-001 event infrastructure; corrected per REVIEW-002 H-1/M-1, D-27).
 * Re-runs a domain's event log through consumers — safe BECAUSE delivery is idempotent:
 * the event_deliveries ledger is consulted inside each event's transaction (insert-or-skip),
 * so already-effected work is skipped and replay after a ledger reset re-executes
 * deterministically. Use cases: new consumer backfill, projection recovery, post-restore
 * reconciliation (ADR-004 rule 21).
 *
 * Ordering & pagination (D-27): the scan order IS the cursor — keyset pagination on
 * (aggregate_id, sequence). The uuid-based resume marker was removed after REVIEW-002 H-1
 * proved it loses events (sort key and resume key disagreed). Per-aggregate order is exact;
 * cross-aggregate order is by aggregate id, which is irrelevant to correctness because
 * consumers are idempotent per event.
 *
 * Payload validation (D-27): replay validates known payloads with the SAME registry as the
 * dispatcher (M-6) — a dead-lettered poison event must not be resurrected by replay.
 */
import type pg from 'pg'
import { assertSqlIdentifier } from './types'
import type { StoredDomainEvent, PlatformActor } from './events'
import type { OutboxConsumer } from './outbox-dispatcher'
import type { PayloadValidator } from '../shared/validation'

export interface ReplayCursor {
  aggregateId: string
  sequence: number
}

export interface ReplayOptions {
  /** Only these event types (default: every type the consumers subscribe to). */
  eventTypes?: string[]
  /** Keyset resume marker from a previous ReplayResult.nextCursor (D-27). */
  after?: ReplayCursor
  /** Safety cap per invocation; call again with nextCursor to continue. */
  limit?: number
  /** M-6 registry — invalid payloads are counted and skipped, never delivered. */
  payloadValidators?: Record<string, PayloadValidator>
  /** Sink for skipped-invalid reports; defaults to console.error. */
  logError?: (message: string) => void
}

export interface ReplayResult {
  scanned: number
  delivered: number
  skipped: number
  /** Events whose payload failed validation — reported, never delivered (M-1). */
  invalid: number
  /** Pass back as options.after to continue; null = log exhausted. */
  nextCursor: ReplayCursor | null
}

interface EventRow {
  id: string
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

export async function replayEvents(
  pool: pg.Pool,
  tables: { eventsTable: string; deliveriesTable: string },
  consumers: OutboxConsumer[],
  options: ReplayOptions = {},
): Promise<ReplayResult> {
  const eventsTable = assertSqlIdentifier(tables.eventsTable)
  const deliveriesTable = assertSqlIdentifier(tables.deliveriesTable)
  const eventTypes = options.eventTypes ?? [...new Set(consumers.flatMap((c) => c.eventTypes))]
  const limit = Math.min(options.limit ?? 1000, 10_000)
  const logError = options.logError ?? ((message: string) => console.error(message))
  const empty: ReplayResult = { scanned: 0, delivered: 0, skipped: 0, invalid: 0, nextCursor: null }
  if (eventTypes.length === 0 || consumers.length === 0) return empty

  // Keyset pagination: resume key = sort key (row-value comparison), per D-27.
  const { rows } = await pool.query<EventRow>(
    `SELECT id, business_id, aggregate_type, aggregate_id, sequence::text, event_type,
            schema_version, payload, actor, occurred_at, correlation_id, causation_id
     FROM ${eventsTable}
     WHERE event_type = ANY($1)
       AND ($2::uuid IS NULL OR (aggregate_id, sequence) > ($2::uuid, $3::bigint))
     ORDER BY aggregate_id, sequence
     LIMIT $4`,
    [eventTypes, options.after?.aggregateId ?? null, options.after?.sequence ?? 0, limit],
  )

  let delivered = 0
  let skipped = 0
  let invalid = 0
  for (const row of rows) {
    // M-1: same validation gate as the dispatcher — poison events stay dead.
    const validator = options.payloadValidators?.[row.event_type]
    if (validator) {
      const validation = validator(row.payload)
      if (!validation.ok) {
        invalid++
        logError(`[replay] event ${row.id} (${row.event_type}) skipped: invalid payload — ${validation.message}`)
        continue
      }
    }

    const event: StoredDomainEvent = {
      eventId: row.id,
      eventType: row.event_type,
      schemaVersion: row.schema_version,
      businessId: row.business_id,
      aggregate: { type: row.aggregate_type, id: row.aggregate_id },
      sequence: Number(row.sequence),
      actor: row.actor,
      payload: row.payload,
      occurredAt: row.occurred_at,
      correlationId: row.correlation_id,
      causationId: row.causation_id,
    }
    for (const consumer of consumers) {
      if (!consumer.eventTypes.includes(event.eventType)) continue
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const claim = await client.query(
          `INSERT INTO ${deliveriesTable} (consumer, event_id) VALUES ($1, $2)
           ON CONFLICT (consumer, event_id) DO NOTHING RETURNING consumer`,
          [consumer.consumer, event.eventId],
        )
        if (claim.rows.length === 0) {
          await client.query('ROLLBACK')
          skipped++
          continue
        }
        await consumer.handle(client, event)
        await client.query('COMMIT')
        delivered++
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw new Error(`replay failed at event ${event.eventId} for consumer ${consumer.consumer}: ${(error as Error).message}`, { cause: error })
      } finally {
        client.release()
      }
    }
  }

  const lastRow = rows[rows.length - 1]
  const nextCursor: ReplayCursor | null =
    rows.length === limit && lastRow
      ? { aggregateId: lastRow.aggregate_id, sequence: Number(lastRow.sequence) }
      : null
  return { scanned: rows.length, delivered, skipped, invalid, nextCursor }
}
