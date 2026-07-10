import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../server/utils/container'
import { newTestContainer, truncateAll, MERCHANT_OUTBOX_TABLES } from '../helpers/pg'
import { OutboxDispatcher, type OutboxConsumer } from '@platform/outbox-dispatcher'
import { asBusinessId, asStoreId } from '@domains/merchant/shared-kernel/ids'
import { uuidv7 } from '@domains/merchant/shared-kernel/uuid'
import { EVENT, makeEvent } from '@domains/merchant/core/domain/events'
import { STANDING_POLICY_CONSUMER } from '@domains/merchant/core/application/policies/standing-consequence-policy'

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

/** Provision a business with one live store via the real commands. */
async function provision() {
  const userId = uuidv7()
  const biz = await container.commands.createBusiness({
    actor: { type: 'user', id: userId }, userId, displayName: 'Outbox Biz', businessType: 'individual',
  })
  if (!biz.ok) throw new Error(biz.error.message)
  const store = await container.commands.createStore({
    actor: { type: 'user', id: userId }, userId, businessId: biz.value.businessId, name: 'Outbox Store',
  })
  if (!store.ok) throw new Error(store.error.message)
  return { userId, businessId: biz.value.businessId, storeId: store.value.storeId }
}

/** Emit business.standing_changed through the aggregate + event store (admin path arrives in a later module). */
async function suspendBusiness(businessId: string) {
  await container.deps.uow.withTransaction(async (tx) => {
    const business = await container.deps.businesses.findById(tx, asBusinessId(businessId), { forUpdate: true })
    const result = business!.changeStanding('suspended', 'fraud_signals', { type: 'admin', id: 'admin-1' })
    if (!result.ok) throw new Error(result.error.message)
    await container.deps.businesses.update(tx, business!)
    await container.deps.eventStore.append(tx, business!.pullPendingEvents())
  })
}

describe('transactional outbox (BLUEPRINT §7)', () => {
  it('every domain event gets an outbox row in the same transaction', async () => {
    await provision()
    const { rows } = await container.pool.query(
      `SELECT count(*)::int AS events,
              (SELECT count(*)::int FROM outbox_events) AS outbox
       FROM domain_events`,
    )
    expect(rows[0].events).toBeGreaterThan(0)
    expect(rows[0].outbox).toBe(rows[0].events)
  })

  it('StandingConsequencePolicy consumes standing_changed: suspension holds every store', async () => {
    const { businessId, storeId } = await provision()
    await suspendBusiness(businessId)

    const result = await container.dispatcher.dispatchPending()
    expect(result.failed).toBe(0)
    expect(result.dispatched).toBeGreaterThan(0)

    const { rows: [store] } = await container.pool.query('SELECT enforcement_hold, status FROM stores WHERE id = $1', [storeId])
    expect(store.enforcement_hold).toBe('suspended')
    expect(store.status).toBe('draft') // orthogonality: merchant intent untouched (ADR §7.2)

    // consequence event emitted + delivery recorded exactly once
    const { rows: deliveries } = await container.pool.query(
      'SELECT count(*)::int AS n FROM event_deliveries WHERE consumer = $1', [STANDING_POLICY_CONSUMER],
    )
    expect(deliveries[0].n).toBe(1)
  })

  it('redelivery is idempotent: resetting the outbox row does not double-apply', async () => {
    const { businessId, storeId } = await provision()
    await suspendBusiness(businessId)
    await container.dispatcher.dispatchPending()

    // Simulate at-least-once: force the dispatched standing event back to pending
    await container.pool.query(
      `UPDATE outbox_events SET status = 'pending', dispatched_at = NULL
       WHERE domain_event_id IN (SELECT id FROM domain_events WHERE event_type = $1)`,
      [EVENT.BUSINESS_STANDING_CHANGED],
    )
    const rerun = await container.dispatcher.dispatchPending()
    expect(rerun.failed).toBe(0)

    const { rows: deliveries } = await container.pool.query(
      'SELECT count(*)::int AS n FROM event_deliveries WHERE consumer = $1', [STANDING_POLICY_CONSUMER],
    )
    expect(deliveries[0].n).toBe(1) // insert-or-skip: no second effect
    const { rows: holdEvents } = await container.pool.query(
      'SELECT count(*)::int AS n FROM domain_events WHERE event_type = $1', [EVENT.STORE_ENFORCEMENT_HOLD_CHANGED],
    )
    expect(holdEvents[0].n).toBe(1)
    void storeId
  })

  it('failing consumers back off and preserve per-business ordering claims', async () => {
    const { businessId } = await provision()
    let attempts = 0
    const failing: OutboxConsumer = {
      consumer: 'test.failing-consumer',
      eventTypes: [EVENT.BUSINESS_STANDING_CHANGED],
      handle: async () => { attempts++; throw new Error('boom') },
    }
    const dispatcher = new OutboxDispatcher(container.pool, MERCHANT_OUTBOX_TABLES, [failing])
    await suspendBusiness(businessId)

    // Drain the whole queue: provisioning events (no matching consumer) dispatch cleanly;
    // only the standing event reaches the failing consumer.
    const first = await dispatcher.dispatchPending(50)
    expect(first.failed).toBe(1)
    expect(attempts).toBe(1)

    const { rows: [row] } = await container.pool.query(
      `SELECT o.status, o.attempts, o.next_attempt_at > now() AS backed_off
       FROM outbox_events o JOIN domain_events e ON e.id = o.domain_event_id
       WHERE e.event_type = $1`, [EVENT.BUSINESS_STANDING_CHANGED],
    )
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.backed_off).toBe(true)

    // rollback also removed the delivery claim — a healthy consumer can still process later
    const { rows: deliveries } = await container.pool.query(
      `SELECT count(*)::int AS n FROM event_deliveries WHERE consumer = 'test.failing-consumer'`,
    )
    expect(deliveries[0].n).toBe(0)
  })

  it('per-aggregate sequence is monotonic and unique (optimistic concurrency guard)', async () => {
    const { storeId } = await provision()
    const { rows } = await container.pool.query(
      `SELECT sequence FROM domain_events WHERE aggregate_type = 'store' AND aggregate_id = $1 ORDER BY sequence`,
      [storeId],
    )
    expect(rows.map((r: { sequence: string }) => Number(r.sequence))).toEqual([1])

    // Appending two more events to the same aggregate continues the sequence
    await container.deps.uow.withTransaction(async (tx) => {
      await container.deps.eventStore.append(tx, [
        makeEvent('test.event_a', { type: 'store', id: asStoreId(storeId) }, null, { type: 'system', id: 't' }, {}),
        makeEvent('test.event_b', { type: 'store', id: asStoreId(storeId) }, null, { type: 'system', id: 't' }, {}),
      ])
    })
    const { rows: after } = await container.pool.query(
      `SELECT sequence FROM domain_events WHERE aggregate_type = 'store' AND aggregate_id = $1 ORDER BY sequence`,
      [storeId],
    )
    expect(after.map((r: { sequence: string }) => Number(r.sequence))).toEqual([1, 2, 3])
  })
})
