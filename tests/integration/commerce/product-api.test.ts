/** Product API — full lifecycle over real HTTP + real PG (IMP-COM-001B). */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const auth = (userId: string) => ({ 'x-dof-user-id': userId })

async function newMerchant() {
  const userId = uuidv7()
  const res = await http.request('POST', '/api/v1/businesses', {
    headers: auth(userId), body: { display_name: 'Soap Co', business_type: 'individual' },
  })
  expect(res.status).toBe(201)
  return { userId, businessId: res.body.business_id as string }
}

async function createSoap(userId: string, businessId: string, overrides: Record<string, unknown> = {}) {
  return http.request('POST', '/api/v1/products', {
    headers: auth(userId),
    body: {
      business_id: businessId, title: 'Lavender Soap', fulfillment_kind: 'physical',
      default_price: { amount: 1500, currency: 'EUR' }, ...overrides,
    },
  })
}

beforeAll(async () => {
  container = newTestContainer()
  setContainer(container)
  http = await startTestApp()
})
afterAll(async () => {
  await http.close()
  setContainer(null)
  await container.shutdown()
})
beforeEach(() => truncateAll(container.pool))

describe('the merchant journey: create → get → update → variants → media → archive → restore', () => {
  it('works end to end with events, audit, and trace in the COMMERCE tables', async () => {
    const { userId, businessId } = await newMerchant()
    const correlationId = uuidv7()

    // create
    const created = await http.request('POST', '/api/v1/products', {
      headers: { ...auth(userId), 'x-request-id': correlationId },
      body: { business_id: businessId, title: 'Lavender Soap', fulfillment_kind: 'physical', default_price: { amount: 1500, currency: 'EUR' } },
    })
    expect(created.status).toBe(201)
    const productId = created.body.product_id as string
    expect(created.body.status).toBe('draft')
    expect(created.body.variants).toHaveLength(1)
    expect(created.body.readiness.ready).toBe(true)

    // get
    const fetched = await http.request('GET', `/api/v1/products/${productId}`, { headers: auth(userId) })
    expect(fetched.status).toBe(200)
    expect(fetched.body.title).toBe('Lavender Soap')

    // atomic PATCH
    const patched = await http.request('PATCH', `/api/v1/products/${productId}`, {
      headers: auth(userId),
      body: { title: 'Rose Soap', description: { content: 'Hand made.' }, category_path: 'home/soap' },
    })
    expect(patched.status).toBe(200)
    expect(patched.body.title).toBe('Rose Soap')
    expect(patched.body.category_path).toBe('home/soap')

    // variant update (price → both events)
    const variantId = created.body.variants[0].variant_id as string
    const priced = await http.request('PATCH', `/api/v1/products/${productId}/variants/${variantId}`, {
      headers: auth(userId), body: { price: { amount: 1800, currency: 'EUR' } },
    })
    expect(priced.status).toBe(200)
    expect(priced.body.variants[0].price.amount).toBe(1800)

    // media add + reorder + remove
    const m1 = await http.request('POST', `/api/v1/products/${productId}/media`, {
      headers: auth(userId), body: { media_id: uuidv7(), role: 'hero' },
    })
    const m2 = await http.request('POST', `/api/v1/products/${productId}/media`, {
      headers: auth(userId), body: { media_id: uuidv7() },
    })
    expect(m1.status).toBe(201)
    expect(m2.status).toBe(201)
    const ids = m2.body.media.map((m: { product_media_id: string }) => m.product_media_id)
    const reordered = await http.request('PUT', `/api/v1/products/${productId}/media/order`, {
      headers: auth(userId), body: { ordered_ids: [ids[1], ids[0]] },
    })
    expect(reordered.status).toBe(200)
    expect(reordered.body.media[0].product_media_id).toBe(ids[1])
    const removed = await http.request('DELETE', `/api/v1/products/${productId}/media/${ids[0]}`, { headers: auth(userId) })
    expect(removed.status).toBe(200)
    expect(removed.body.media).toHaveLength(1)

    // archive (read-only) → restore
    expect((await http.request('POST', `/api/v1/products/${productId}/archive`, { headers: auth(userId) })).status).toBe(200)
    const blocked = await http.request('PATCH', `/api/v1/products/${productId}`, {
      headers: auth(userId), body: { title: 'Nope' },
    })
    expect(blocked.status).toBe(409)
    expect(blocked.body.code).toBe('INVALID_TRANSITION')
    const restored = await http.request('POST', `/api/v1/products/${productId}/restore`, { headers: auth(userId) })
    expect(restored.status).toBe(200)
    expect(restored.body.status).toBe('active')

    // list (grid)
    const list = await http.request('GET', `/api/v1/products?business_id=${businessId}`, { headers: auth(userId) })
    expect(list.status).toBe(200)
    expect(list.body.items).toHaveLength(1)
    expect(list.body.items[0].variant_count).toBe(1)

    // events landed in COMMERCE tables with trace + outbox rows; audit in commerce_audit_logs
    const { rows: events } = await container.pool.query(
      `SELECT e.event_type, e.correlation_id, (SELECT count(*)::int FROM commerce_outbox_events o WHERE o.domain_event_id = e.id) AS outboxed
       FROM commerce_domain_events e ORDER BY e.occurred_at, e.sequence`)
    expect(events.length).toBeGreaterThanOrEqual(8)
    expect(events[0].event_type).toBe('commerce.product.created')
    expect(events[0].correlation_id).toBe(correlationId)
    for (const row of events) expect(row.outboxed).toBe(1)
    const { rows: audits } = await container.pool.query('SELECT command FROM commerce_audit_logs')
    expect(audits.map((a: { command: string }) => a.command)).toEqual(expect.arrayContaining([
      'commerce.product.create', 'commerce.product.update', 'commerce.variant.update',
      'commerce.product.media_add', 'commerce.product.media_reorder', 'commerce.product.media_remove',
      'commerce.product.archive', 'commerce.product.restore',
    ]))
    const { rows: merchantEvents } = await container.pool.query(
      `SELECT count(*)::int AS n FROM domain_events WHERE event_type LIKE 'commerce.%'`)
    expect(merchantEvents[0].n).toBe(0) // per-domain tables (D-22): nothing leaked into merchant's log

    // commerce dispatcher drains cleanly (payload validation live, D-29 makes poison impossible)
    const dispatched = await container.commerce.dispatcher.dispatchPending()
    expect(dispatched.failed).toBe(0)
  })
})

describe('authorization & masking', () => {
  it('401 unauthenticated; 404 for cross-tenant probes; draft-grant roles denied on full-mode commands', async () => {
    const { userId, businessId } = await newMerchant()
    const created = await createSoap(userId, businessId)
    const productId = created.body.product_id as string

    expect((await http.request('GET', `/api/v1/products/${productId}`, {})).status).toBe(401)

    const intruder = (await newMerchant()).userId
    for (const [method, path, body] of [
      ['GET', `/api/v1/products/${productId}`, undefined],
      ['PATCH', `/api/v1/products/${productId}`, { title: 'Stolen' }],
      ['POST', `/api/v1/products/${productId}/archive`, {}],
    ] as const) {
      const res = await http.request(method, path, { headers: auth(intruder), ...(body ? { body } : {}) })
      expect(res.status, `${method} ${path}`).toBe(404) // masked
    }

    // support_agent holds catalog.product.write at DRAFT grade — full-mode commands denied
    const agent = uuidv7()
    await container.pool.query(
      `INSERT INTO staff_memberships (id, business_id, principal_type, principal_id, roles, status)
       VALUES ($1, $2, 'user', $3, '{support_agent}', 'active')`, [uuidv7(), businessId, agent])
    const denied = await createSoap(agent, businessId, { title: 'Agent Soap' })
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBe('PERMISSION_DENIED')
  })

  it('suspended standing blocks writes; validation and domain conflicts map to problem+json', async () => {
    const { userId, businessId } = await newMerchant()
    const created = await createSoap(userId, businessId)
    const productId = created.body.product_id as string

    const invalid = await createSoap(userId, businessId, { fulfillment_kind: 'quantum' })
    expect(invalid.status).toBe(422)

    const dupCombo = await http.request('POST', `/api/v1/products/${productId}/variants`, {
      headers: auth(userId), body: { price: { amount: 900, currency: 'EUR' } },
    })
    expect(dupCombo.status).toBe(409) // zero-options ⇒ one variant (I3 corollary)

    await container.pool.query(`UPDATE businesses SET standing = 'suspended' WHERE id = $1`, [businessId])
    container.entitlements.invalidate(businessId)
    const blocked = await createSoap(userId, businessId, { title: 'Blocked' })
    expect(blocked.status).toBe(403)
    expect(blocked.body.code).toBe('STANDING_BLOCKED')
  })

  it('idempotency: same key replays the 201; PATCH is atomic (bad category rolls back good title)', async () => {
    const { userId, businessId } = await newMerchant()
    const headers = { ...auth(userId), 'idempotency-key': 'prod-create-1' }
    const body = { business_id: businessId, title: 'Idem Soap', fulfillment_kind: 'physical', default_price: { amount: 100, currency: 'EUR' } }
    const first = await http.request('POST', '/api/v1/products', { headers, body })
    const replay = await http.request('POST', '/api/v1/products', { headers, body })
    expect(first.status).toBe(201)
    expect(replay.status).toBe(201)
    expect(replay.body.product_id).toBe(first.body.product_id)
    const { rows } = await container.pool.query('SELECT count(*)::int AS n FROM products')
    expect(rows[0].n).toBe(1)

    const productId = first.body.product_id as string
    const atomic = await http.request('PATCH', `/api/v1/products/${productId}`, {
      headers: auth(userId), body: { title: 'New Title', category_path: 'BAD//path' },
    })
    expect(atomic.status).toBe(422)
    const after = await http.request('GET', `/api/v1/products/${productId}`, { headers: auth(userId) })
    expect(after.body.title).toBe('Idem Soap') // the good title change rolled back with the bad category
  })
})

describe('concurrency (kernel pattern: row lock + sequence guard)', () => {
  it('parallel distinct variant adds all land; parallel identical combos yield exactly one winner', async () => {
    const { userId, businessId } = await newMerchant()
    const created = await createSoap(userId, businessId, {
      options: [{ name: 'Scent', values: ['A', 'B', 'C', 'D'] }],
      variants: [{ price: { amount: 100, currency: 'EUR' }, option_values: { Scent: 'A' } }],
      default_price: undefined,
    })
    expect(created.status).toBe(201)
    const productId = created.body.product_id as string

    // distinct combos in parallel — the row lock serializes; all succeed
    const distinct = await Promise.all(['B', 'C', 'D'].map((scent) =>
      http.request('POST', `/api/v1/products/${productId}/variants`, {
        headers: auth(userId), body: { price: { amount: 100, currency: 'EUR' }, option_values: { Scent: scent } },
      })))
    expect(distinct.map((r) => r.status)).toEqual([201, 201, 201])

    // identical combo raced by two writers: exactly one 201, one 409
    const fresh = await createSoap(userId, businessId, {
      title: 'Race Soap',
      options: [{ name: 'Size', values: ['S'] }],
      variants: [], default_price: undefined,
    })
    expect(fresh.status).toBe(422) // options require explicit variants — guard intact under load
    const fresh2 = await createSoap(userId, businessId, {
      title: 'Race Soap',
      options: [{ name: 'Size', values: ['S', 'M'] }],
      variants: [{ price: { amount: 100, currency: 'EUR' }, option_values: { Size: 'S' } }],
      default_price: undefined,
    })
    const raceId = fresh2.body.product_id as string
    const raced = await Promise.all([1, 2].map(() =>
      http.request('POST', `/api/v1/products/${raceId}/variants`, {
        headers: auth(userId), body: { price: { amount: 100, currency: 'EUR' }, option_values: { Size: 'M' } },
      })))
    const statuses = raced.map((r) => r.status).sort()
    expect(statuses).toEqual([201, 409])

    // per-aggregate sequence stayed strictly monotonic under concurrency
    const { rows } = await container.pool.query(
      `SELECT sequence FROM commerce_domain_events WHERE aggregate_id = $1 ORDER BY sequence`, [productId])
    const sequences = rows.map((r: { sequence: string }) => Number(r.sequence))
    expect(sequences).toEqual(Array.from({ length: sequences.length }, (_, i) => i + 1))
  })
})
