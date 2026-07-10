/** IMP-PLT-001 integration: health checks, event replay, projection versioning — real PG. */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../server/utils/container'
import { newTestContainer, truncateAll, MERCHANT_OUTBOX_TABLES } from '../helpers/pg'
import { replayEvents } from '@platform/replay'
import { HealthCheckRegistry, dbHealthCheck } from '@platform/health'
import { ProjectionRegistry } from '@platform/projection-registry'
import type { OutboxConsumer } from '@platform/outbox-dispatcher'
import { EVENT, makeEvent } from '@domains/merchant/core/domain/events'
import { asStoreId } from '@domains/merchant/shared-kernel/ids'
import { uuidv7 } from '@domains/merchant/shared-kernel/uuid'

let container: Container

beforeAll(() => {
  container = newTestContainer()
  setContainer(container)
})
afterAll(async () => {
  setContainer(null)
  await container.shutdown()
})
beforeEach(() => truncateAll(container.pool))

async function appendTestEvents(aggregateId: string, types: string[]) {
  await container.deps.uow.withTransaction(async (tx) => {
    await container.deps.eventStore.append(
      tx,
      types.map((t) => makeEvent(t, { type: 'store', id: asStoreId(aggregateId) }, aggregateId, { type: 'system', id: 'replay-test' }, { t })),
    )
  })
}

describe('replay (IMP-PLT-001 event infrastructure)', () => {
  it('is a no-op for already-delivered events; reprocesses after a ledger reset, in per-aggregate order', async () => {
    const aggregate = uuidv7()
    await appendTestEvents(aggregate, ['replay.e1', 'replay.e2', 'replay.e3'])

    const seen: string[] = []
    const consumer: OutboxConsumer = {
      consumer: 'test.replay-consumer',
      eventTypes: ['replay.e1', 'replay.e2', 'replay.e3'],
      handle: async (_tx, event) => { seen.push(event.eventType) },
    }

    // First replay delivers everything (dispatcher never ran for these) in sequence order
    const first = await replayEvents(container.pool, MERCHANT_OUTBOX_TABLES, [consumer])
    expect(first).toMatchObject({ scanned: 3, delivered: 3, skipped: 0 })
    expect(seen).toEqual(['replay.e1', 'replay.e2', 'replay.e3'])

    // Second replay: the deliveries ledger makes it exactly-once — zero re-execution
    const second = await replayEvents(container.pool, MERCHANT_OUTBOX_TABLES, [consumer])
    expect(second).toMatchObject({ scanned: 3, delivered: 0, skipped: 3 })
    expect(seen).toHaveLength(3)

    // Ledger reset (the deliberate recovery action) → deterministic reprocessing
    await container.pool.query(`DELETE FROM event_deliveries WHERE consumer = 'test.replay-consumer'`)
    const third = await replayEvents(container.pool, MERCHANT_OUTBOX_TABLES, [consumer])
    expect(third.delivered).toBe(3)
    expect(seen.slice(3)).toEqual(['replay.e1', 'replay.e2', 'replay.e3'])
  })

  it('REVIEW-002 H-1 regression: keyset pagination delivers EVERY event across pages, none skipped', async () => {
    // Interleaved aggregates with multiple events each — the shape that broke the
    // uuid-based resume marker (sort key and resume key disagreed).
    const aggregates = [uuidv7(), uuidv7(), uuidv7()].sort() // deterministic scan order
    for (const aggregate of aggregates) {
      await appendTestEvents(aggregate, ['replay.page', 'replay.page', 'replay.page'])
    }

    const seen: string[] = []
    const consumer: OutboxConsumer = {
      consumer: 'test.replay-pagination',
      eventTypes: ['replay.page'],
      handle: async (_tx, event) => { seen.push(`${event.aggregate.id}#${event.sequence}`) },
    }

    // Page size 2 forces page boundaries INSIDE aggregates — the worst case.
    let cursor: { aggregateId: string; sequence: number } | undefined
    let pages = 0
    let totalDelivered = 0
    for (;;) {
      const result = await replayEvents(container.pool, MERCHANT_OUTBOX_TABLES, [consumer], {
        limit: 2, after: cursor,
      })
      totalDelivered += result.delivered
      pages++
      if (!result.nextCursor) break
      cursor = result.nextCursor
      if (pages > 10) throw new Error('cursor did not terminate')
    }

    expect(totalDelivered).toBe(9) // 3 aggregates × 3 events — nothing skipped
    const expected = aggregates.flatMap((a) => [1, 2, 3].map((n) => `${a}#${n}`))
    expect(seen).toEqual(expected) // exact per-aggregate order preserved across page boundaries
  })

  it('REVIEW-002 M-1 regression: replay skips invalid payloads with the dispatcher registry', async () => {
    const { kernelPayloadValidators } = await import('@contracts/schemas/events/payloads')
    // Corrupt standing_changed payload (the M-6 fixture), appended directly
    await container.deps.uow.withTransaction(async (tx) => {
      await container.deps.eventStore.append(tx, [
        makeEvent(EVENT.BUSINESS_STANDING_CHANGED, { type: 'business', id: uuidv7() }, uuidv7(),
          { type: 'admin', id: 'a' }, { business_id: uuidv7(), from: 'not-a-standing', reason_code: 'x' }),
      ])
    })

    let invoked = 0
    const consumer: OutboxConsumer = {
      consumer: 'test.replay-m1',
      eventTypes: [EVENT.BUSINESS_STANDING_CHANGED],
      handle: async () => { invoked++ },
    }
    const errors: string[] = []
    const result = await replayEvents(container.pool, MERCHANT_OUTBOX_TABLES, [consumer], {
      payloadValidators: kernelPayloadValidators(),
      logError: (m) => errors.push(m),
    })
    expect(result.invalid).toBe(1)
    expect(result.delivered).toBe(0)
    expect(invoked).toBe(0) // the poison event stayed dead
    expect(errors[0]).toMatch(/invalid payload/)
  })

  it('a failing consumer aborts replay atomically (no partial delivery claim)', async () => {
    const aggregate = uuidv7()
    await appendTestEvents(aggregate, ['replay.boom'])
    const failing: OutboxConsumer = {
      consumer: 'test.replay-failing',
      eventTypes: ['replay.boom'],
      handle: async () => { throw new Error('kaput') },
    }
    await expect(replayEvents(container.pool, MERCHANT_OUTBOX_TABLES, [failing])).rejects.toThrow(/kaput/)
    const { rows } = await container.pool.query(
      `SELECT count(*)::int AS n FROM event_deliveries WHERE consumer = 'test.replay-failing'`,
    )
    expect(rows[0].n).toBe(0) // rollback removed the claim — retryable after the fix
  })
})

describe('health checks (IMP-PLT-001 observability)', () => {
  it('container health reports database + projections ok', async () => {
    const report = await container.health.run()
    expect(report.status).toBe('ok')
    expect(report.checks.map((c) => c.name).sort()).toEqual(['database', 'projections'])
    for (const check of report.checks) expect(check.ok).toBe(true)
  })

  it('a failing check degrades the report without throwing', async () => {
    const registry = new HealthCheckRegistry()
    registry.register('database', dbHealthCheck(container.pool))
    registry.register('doomed', async () => { throw new Error('nope') })
    const report = await registry.run()
    expect(report.status).toBe('degraded')
    expect(report.checks.find((c) => c.name === 'doomed')?.ok).toBe(false)
    expect(report.checks.find((c) => c.name === 'database')?.ok).toBe(true)
  })
})

describe('REVIEW-002 M-2 regression: projections with indexes are redeploy-safe', () => {
  it('multi-statement schemaSql (table + indexes) survives ensure → ensure → rebuild', async () => {
    const registry = new ProjectionRegistry()
    registry.register({
      name: 'rm_indexed_probe',
      version: 1,
      sourceEventTypes: [],
      schemaSql: (t) => `
        CREATE TABLE ${t} (id uuid PRIMARY KEY, business_id uuid NOT NULL, status text NOT NULL);
        CREATE INDEX idx_${t}_business ON ${t} (business_id, status);
      `,
      build: async () => {},
    })
    try {
      await registry.ensure(container.pool, 'rm_indexed_probe')
      // Second deploy: must be a clean no-op (the old regex rewrite failed here)
      await registry.ensure(container.pool, 'rm_indexed_probe')
      // Data survives ensure
      await container.pool.query(`INSERT INTO rm_indexed_probe VALUES ($1, $2, 'live')`, [uuidv7(), uuidv7()])
      await registry.ensure(container.pool, 'rm_indexed_probe')
      const kept = await container.pool.query('SELECT count(*)::int AS n FROM rm_indexed_probe')
      expect(kept.rows[0].n).toBe(1)

      // Rebuild TWICE: the second rebuild is the regression — shadow-suffixed index names
      // must be normalized after the swap or they collide on the next shadow build.
      await registry.rebuild(container.pool, 'rm_indexed_probe')
      await registry.rebuild(container.pool, 'rm_indexed_probe')
      const { rows: indexes } = await container.pool.query(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'rm_indexed_probe'`,
      )
      const names = indexes.map((r: { indexname: string }) => r.indexname)
      expect(names).toContain('idx_rm_indexed_probe_business')
      expect(names.every((n: string) => !n.includes('__shadow'))).toBe(true)
    } finally {
      await container.pool.query('DROP TABLE IF EXISTS rm_indexed_probe')
      await container.pool.query('DROP TABLE IF EXISTS rm_indexed_probe__shadow')
    }
  })
})

describe('projection versioning (IMP-PLT-001)', () => {
  it('rebuild stamps the definition version; runningVersion reads it back', async () => {
    const registry = new ProjectionRegistry()
    registry.register({
      name: 'rm_version_probe',
      version: 3,
      sourceEventTypes: [],
      schemaSql: (t) => `CREATE TABLE ${t} (id int PRIMARY KEY)`,
      build: async () => {},
    })
    try {
      expect(await registry.runningVersion(container.pool, 'rm_version_probe')).toBeNull()
      await registry.rebuild(container.pool, 'rm_version_probe')
      expect(await registry.runningVersion(container.pool, 'rm_version_probe')).toBe(3)
    } finally {
      await container.pool.query('DROP TABLE IF EXISTS rm_version_probe')
    }
  })
})
