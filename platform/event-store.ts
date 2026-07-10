/**
 * Parameterized event store (BLUEPRINT-002 K1): one implementation, one instance per
 * domain with that domain's tables and its OWN ordering-scope function (D-19).
 * Semantics unchanged from Module 1: append events + outbox rows in the caller's
 * transaction; per-aggregate sequence with the UNIQUE concurrency guard; trace stamped
 * at append (D-20).
 */
import type { Tx, EventStore } from './types'
import { assertSqlIdentifier } from './types'
import type { NewDomainEvent, StoredDomainEvent, TraceContext, OrderingScopeFn } from './events'
import { uuidv7 } from './uuid'
import { asClient } from './db'

export interface EventStoreTables {
  eventsTable: string
  outboxTable: string
  orderingScope: OrderingScopeFn
}

export class PgEventStore implements EventStore {
  private readonly eventsTable: string
  private readonly outboxTable: string
  private readonly orderingScope: OrderingScopeFn

  constructor(config: EventStoreTables) {
    this.eventsTable = assertSqlIdentifier(config.eventsTable)
    this.outboxTable = assertSqlIdentifier(config.outboxTable)
    this.orderingScope = config.orderingScope
  }

  async append(tx: Tx, events: NewDomainEvent[], trace?: TraceContext): Promise<StoredDomainEvent[]> {
    if (events.length === 0) return []
    const client = asClient(tx)
    const stored: StoredDomainEvent[] = []
    const nextSequence = new Map<string, number>()

    for (const event of events) {
      const aggKey = `${event.aggregate.type}:${event.aggregate.id}`
      let sequence = nextSequence.get(aggKey)
      if (sequence === undefined) {
        const { rows } = await client.query<{ next: string }>(
          `SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM ${this.eventsTable}
           WHERE aggregate_type = $1 AND aggregate_id = $2`,
          [event.aggregate.type, event.aggregate.id],
        )
        sequence = Number(rows[0]!.next)
      }
      nextSequence.set(aggKey, sequence + 1)

      const eventId = uuidv7()
      const correlationId = trace?.correlationId ?? null
      const causationId = trace?.causationId ?? null
      const { rows: inserted } = await client.query<{ occurred_at: Date }>(
        `INSERT INTO ${this.eventsTable} (id, business_id, aggregate_type, aggregate_id, sequence, event_type, schema_version, payload, actor, correlation_id, causation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING occurred_at`,
        [eventId, event.businessId, event.aggregate.type, event.aggregate.id, sequence,
         event.eventType, event.schemaVersion, event.payload, event.actor, correlationId, causationId],
      )
      await client.query(
        `INSERT INTO ${this.outboxTable} (id, domain_event_id, partition_key) VALUES ($1, $2, $3)`,
        [uuidv7(), eventId, this.orderingScope(event)],
      )
      stored.push({ ...event, eventId, sequence, occurredAt: inserted[0]!.occurred_at, correlationId, causationId })
    }
    return stored
  }
}
