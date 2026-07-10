/** Regression tests for REVIEW-001 remediation (H-1, H-2, M-1, M-6, L-7). */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp, createRouter, toNodeListener } from 'h3'
import { setContainer, type Container } from '../../server/utils/container'
import { newTestContainer, truncateAll, MERCHANT_OUTBOX_TABLES } from '../helpers/pg'
import { startTestApp, type TestHttp } from '../helpers/app'
import { OutboxDispatcher, type OutboxConsumer } from '@platform/outbox-dispatcher'
import { kernelPayloadValidators } from '@contracts/schemas/events/payloads'
import { EVENT, makeEvent } from '@domains/merchant/core/domain/events'
import { asStoreId } from '@domains/merchant/shared-kernel/ids'
import { uuidv7 } from '@domains/merchant/shared-kernel/uuid'
import cronRoute from '../../server/api/internal/outbox-dispatch'

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

async function appendStoreEvents(storeId: string, types: string[]) {
  await container.deps.uow.withTransaction(async (tx) => {
    await container.deps.eventStore.append(
      tx,
      types.map((t) => makeEvent(t, { type: 'store', id: asStoreId(storeId) }, storeId, { type: 'system', id: 'test' }, { n: t })),
    )
  })
}

describe('H-1: per-partition ordering survives backoff', () => {
  it('a failing head event holds its partition; other partitions flow', async () => {
    const storeA = uuidv7() // partition A (partition_key = business_id ?? aggregate id)
    const storeB = uuidv7() // partition B
    await appendStoreEvents(storeA, ['test.a1', 'test.a2'])
    await appendStoreEvents(storeB, ['test.b1'])

    const seen: string[] = []
    const consumer: OutboxConsumer = {
      consumer: 'test.ordering',
      eventTypes: ['test.a1', 'test.a2', 'test.b1'],
      handle: async (_tx, event) => {
        if (event.eventType === 'test.a1' && !seen.includes('fail-once')) {
          seen.push('fail-once')
          throw new Error('transient failure on a1')
        }
        seen.push(event.eventType)
      },
    }
    const dispatcher = new OutboxDispatcher(container.pool, MERCHANT_OUTBOX_TABLES, [consumer])

    await dispatcher.dispatchPending(10)
    // a1 failed and is backing off → a2 MUST NOT have been delivered; b1 flows freely.
    expect(seen).toContain('fail-once')
    expect(seen).toContain('test.b1')
    expect(seen).not.toContain('test.a2')

    // Clear the backoff → head retries and the partition drains IN ORDER.
    await container.pool.query(`UPDATE outbox_events SET next_attempt_at = now() WHERE status = 'pending'`)
    await dispatcher.dispatchPending(10)
    const aOrder = seen.filter((s) => s.startsWith('test.a'))
    expect(aOrder).toEqual(['test.a1', 'test.a2'])
  })
})

describe('M-6: invalid payloads dead-letter immediately, no retries', () => {
  it('a known event type with a corrupt payload never reaches consumers', async () => {
    let invoked = 0
    const consumer: OutboxConsumer = {
      consumer: 'test.m6',
      eventTypes: [EVENT.BUSINESS_STANDING_CHANGED],
      handle: async () => { invoked++ },
    }
    const dispatcher = new OutboxDispatcher(container.pool, MERCHANT_OUTBOX_TABLES, [consumer], kernelPayloadValidators())

    // Corrupt payload: missing `to`, wrong enum for `from`
    await container.deps.uow.withTransaction(async (tx) => {
      await container.deps.eventStore.append(tx, [
        makeEvent(EVENT.BUSINESS_STANDING_CHANGED, { type: 'business', id: uuidv7() }, uuidv7(),
          { type: 'admin', id: 'a' }, { business_id: uuidv7(), from: 'not-a-standing', reason_code: 'x' }),
      ])
    })

    const result = await dispatcher.dispatchPending(10)
    expect(result.failed).toBe(1)
    expect(invoked).toBe(0)

    const { rows: [row] } = await container.pool.query(`SELECT status, attempts FROM outbox_events`)
    expect(row.status).toBe('dead') // immediately — not after 10 retries
    expect(row.attempts).toBe(0)
  })
})

describe('H-2: cron route answers GET (Vercel cron) and enforces the secret', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    const app = createApp()
    const router = createRouter()
    router.get('/api/internal/outbox-dispatch', cronRoute)
    router.post('/api/internal/outbox-dispatch', cronRoute)
    app.use(router)
    server = createServer(toNodeListener(app))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))))

  it('GET and POST both dispatch; wrong secret is rejected', async () => {
    process.env.NUXT_CRON_SECRET = 'test-secret'
    try {
      const unauthorized = await fetch(`${base}/api/internal/outbox-dispatch`)
      expect(unauthorized.status).toBe(401)

      for (const method of ['GET', 'POST'] as const) {
        const res = await fetch(`${base}/api/internal/outbox-dispatch`, {
          method,
          headers: { authorization: 'Bearer test-secret' },
        })
        expect(res.status, method).toBe(200)
        const body = await res.json()
        expect(body).toHaveProperty('dispatched')
        expect(body).toHaveProperty('failed')
      }
    } finally {
      delete process.env.NUXT_CRON_SECRET
    }
  })
})

describe('M-1: stale in-flight idempotency claims are reclaimable', () => {
  it('a crash between commit and complete() no longer wedges the key for 24h', async () => {
    const hash = container.idempotency.hash({ x: 1 })
    expect((await container.idempotency.begin('k1', 'ep', 'actor', hash)).kind).toBe('fresh')
    // Fresh claim, never completed (simulated crash): immediately → in_flight
    expect((await container.idempotency.begin('k1', 'ep', 'actor', hash)).kind).toBe('in_flight')
    // Age the claim past the reclaim window → next attempt reclaims it
    await container.pool.query(
      `UPDATE request_idempotency_keys SET created_at = now() - interval '2 minutes' WHERE idempotency_key = 'k1'`,
    )
    expect((await container.idempotency.begin('k1', 'ep', 'actor', hash)).kind).toBe('fresh')
  })
})

describe('M-4: concurrent first-business creation is race-safe', () => {
  it('parallel creates for a brand-new user never 500 and produce exactly one merchant account', async () => {
    const userId = uuidv7()
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        container.commands.createBusiness({
          actor: { type: 'user', id: userId },
          userId,
          displayName: `Race Biz ${i}`,
          businessType: 'individual',
        }),
      ),
    )
    // No unhandled exception (a throw would reject Promise.all); every request succeeds.
    for (const result of results) expect(result.ok).toBe(true)

    const accounts = await container.pool.query('SELECT count(*)::int AS n FROM merchant_accounts WHERE user_id = $1', [userId])
    expect(accounts.rows[0].n).toBe(1) // the race produced ONE account…
    const businesses = await container.pool.query('SELECT count(*)::int AS n FROM businesses')
    expect(businesses.rows[0].n).toBe(5) // …and every business
    const onboarded = await container.pool.query(
      `SELECT count(*)::int AS n FROM domain_events WHERE event_type = 'merchant.onboarded'`,
    )
    expect(onboarded.rows[0].n).toBe(1) // merchant.onboarded emitted exactly once
  })
})

describe('L-7: workspace with multiple businesses', () => {
  it('lists every membership with its own stores and capabilities', async () => {
    const http: TestHttp = await startTestApp()
    try {
      const userId = uuidv7()
      const headers = { 'x-dof-user-id': userId }
      for (const name of ['First Business', 'Second Business']) {
        const res = await http.request('POST', '/api/v1/businesses', {
          headers, body: { display_name: name, business_type: 'individual' },
        })
        expect(res.status).toBe(201)
      }
      const workspace = await http.request('GET', '/api/v1/workspace', { headers })
      expect(workspace.body.businesses).toHaveLength(2)
      const names = workspace.body.businesses.map((b: { display_name: string }) => b.display_name).sort()
      expect(names).toEqual(['First Business', 'Second Business'])
    } finally {
      await http.close()
    }
  })
})
