/**
 * OPS-001A integration — locations over real HTTP + real PG (embedded, no mocks):
 * Ghost creation + uniqueness under race, L1's partial index, tier gate, step-up,
 * masking sweep, D-29 no-ops, events/outbox/audit in the OPERATIONS tables, and the
 * first cross-domain consumer (commerce.product.created → ghost).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

const auth = (userId: string) => ({ 'x-dof-user-id': userId })
const stepUp = (userId: string) => ({ ...auth(userId), 'x-dof-step-up': 'true' })

async function newMerchant(tier: 'starter' | 'growth' = 'growth') {
  const userId = uuidv7()
  const res = await http.request('POST', '/api/v1/businesses', {
    headers: auth(userId), body: { display_name: 'Ops Co', business_type: 'individual' },
  })
  expect(res.status).toBe(201)
  const businessId = res.body.business_id as string
  if (tier !== 'starter') {
    await container.pool.query(`UPDATE businesses SET scale_tier = $2 WHERE id = $1`, [businessId, tier])
    container.entitlements.invalidate(businessId)
  }
  return { userId, businessId }
}

async function createLocation(userId: string, businessId: string, overrides: Record<string, unknown> = {}) {
  return http.request('POST', `/api/v1/businesses/${businessId}/locations`, {
    headers: auth(userId),
    body: { kind: 'store', name: 'Second shop', ...overrides },
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

describe('the Ghost (BLUEPRINT-003 §0.2)', () => {
  it('first list lazily creates exactly one invisible default; repeat lists reuse it', async () => {
    const { userId, businessId } = await newMerchant('starter')
    const first = await http.request('GET', `/api/v1/businesses/${businessId}/locations`, { headers: auth(userId) })
    expect(first.status).toBe(200)
    expect(first.body.items).toHaveLength(1)
    expect(first.body.items[0]).toMatchObject({ kind: 'home', is_default: true, ghost: true })

    const again = await http.request('GET', `/api/v1/businesses/${businessId}/locations`, { headers: auth(userId) })
    expect(again.body.items).toHaveLength(1)
    expect(again.body.items[0].location_id).toBe(first.body.items[0].location_id)

    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM locations WHERE business_id = $1`, [businessId])
    expect(rows[0].n).toBe(1)
  })

  it('20 concurrent ensures yield exactly one default (advisory lock + L1 index)', async () => {
    const { businessId } = await newMerchant('starter')
    const results = await Promise.all(Array.from({ length: 20 }, () =>
      container.operations.commands.ensureGhostLocation({ businessId })))
    for (const r of results) expect(r.ok).toBe(true)
    const ids = new Set(results.map((r) => (r.ok ? r.value.location_id : 'fail')))
    expect(ids.size).toBe(1)
    const { rows } = await container.pool.query(
      `SELECT count(*)::int AS n FROM locations WHERE business_id = $1 AND is_default`, [businessId])
    expect(rows[0].n).toBe(1)
  })

  it('L1 big brother: a second active default dies on uq_locations_default', async () => {
    const { businessId } = await newMerchant('starter')
    await container.operations.commands.ensureGhostLocation({ businessId })
    await expect(container.pool.query(
      `INSERT INTO locations (id, business_id, kind, name, status, is_default)
       VALUES ($1, $2, 'home', 'Rogue default', 'active', true)`,
      [uuidv7(), businessId],
    )).rejects.toThrow(/uq_locations_default/)
  })

  it('the commerce.product.created consumer ensures the ghost (first cross-domain consumer)', async () => {
    const { userId, businessId } = await newMerchant('starter')
    const product = await http.request('POST', '/api/v1/products', {
      headers: auth(userId),
      body: { business_id: businessId, title: 'Soap', fulfillment_kind: 'physical', default_price: { amount: 900, currency: 'EUR' } },
    })
    expect(product.status).toBe(201)

    const dispatched = await container.commerce.dispatcher.dispatchPending()
    expect(dispatched.failed).toBe(0)

    const { rows } = await container.pool.query(
      `SELECT kind, is_default FROM locations WHERE business_id = $1`, [businessId])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'home', is_default: true })

    const { rows: deliveries } = await container.pool.query(
      `SELECT count(*)::int AS n FROM commerce_event_deliveries WHERE consumer = 'operations.ghost-location'`)
    expect(deliveries[0].n).toBeGreaterThanOrEqual(1)

    // replayed dispatch stays idempotent (delivery ledger + advisory-locked ensure)
    await container.commerce.dispatcher.dispatchPending()
    const { rows: after } = await container.pool.query(
      `SELECT count(*)::int AS n FROM locations WHERE business_id = $1`, [businessId])
    expect(after[0].n).toBe(1)
  })
})

describe('location lifecycle over HTTP', () => {
  it('create → detected-change patch → no-op patch → step-up close, with ops-table facts', async () => {
    const { userId, businessId } = await newMerchant()
    const created = await createLocation(userId, businessId, { pickup_instructions: 'Ring twice' })
    expect(created.status).toBe(201)
    const locationId = created.body.location_id as string
    expect(created.body).toMatchObject({ kind: 'store', is_default: false, ghost: false })

    const renamed = await http.request('PATCH', `/api/v1/locations/${locationId}`, {
      headers: auth(userId), body: { name: 'Saturday stall' },
    })
    expect(renamed.status).toBe(200)

    const noop = await http.request('PATCH', `/api/v1/locations/${locationId}`, {
      headers: auth(userId), body: { name: 'Saturday stall' },
    })
    expect(noop.status).toBe(200) // silent no-op (D-29)

    const noStepUp = await http.request('POST', `/api/v1/locations/${locationId}/close`, { headers: auth(userId), body: {} })
    expect(noStepUp.status).toBe(403)
    expect(noStepUp.body.code).toBe('STEP_UP_REQUIRED')

    const closed = await http.request('POST', `/api/v1/locations/${locationId}/close`, { headers: stepUp(userId), body: {} })
    expect(closed.status).toBe(200)
    expect(closed.body.status).toBe('closed')

    const editClosed = await http.request('PATCH', `/api/v1/locations/${locationId}`, {
      headers: auth(userId), body: { name: 'Zombie' },
    })
    expect(editClosed.status).toBe(409)
    expect(editClosed.body.code).toBe('INVALID_TRANSITION')

    // events + outbox + audit landed in the OPERATIONS tables, and nothing leaked elsewhere
    const { rows: events } = await container.pool.query(
      `SELECT e.event_type, (SELECT count(*)::int FROM operations_outbox_events o WHERE o.domain_event_id = e.id) AS outboxed
       FROM operations_domain_events e WHERE e.business_id = $1 ORDER BY e.occurred_at, e.sequence`, [businessId])
    expect(events.map((e: { event_type: string }) => e.event_type)).toEqual([
      'operations.location.created', 'operations.location.updated', 'operations.location.closed',
    ])
    for (const row of events) expect(row.outboxed).toBe(1)

    const { rows: audits } = await container.pool.query(
      `SELECT command, sensitivity FROM operations_audit_logs WHERE business_id = $1 ORDER BY created_at`, [businessId])
    expect(audits.map((a: { command: string }) => a.command)).toEqual([
      'operations.location.create', 'operations.location.update', 'operations.location.close',
    ])
    expect(audits[2]!.sensitivity).toBe('sensitive')

    const { rows: leaked } = await container.pool.query(
      `SELECT count(*)::int AS n FROM domain_events WHERE event_type LIKE 'operations.%'`)
    expect(leaked[0].n).toBe(0) // per-domain tables (D-22)

    const drained = await container.operations.dispatcher.dispatchPending()
    expect(drained.failed).toBe(0)
  })

  it('L4 over the wire: popup without window is a 422 that educates', async () => {
    const { userId, businessId } = await newMerchant()
    const bad = await createLocation(userId, businessId, { kind: 'popup', name: 'Xmas stand' })
    expect(bad.status).toBe(422)
  })
})

describe('gates & masking (CDC-001 §3)', () => {
  it('Starter tier lacks ops.locations (Growth line): create denied CAPABILITY_MISSING', async () => {
    const { userId, businessId } = await newMerchant('starter')
    const denied = await createLocation(userId, businessId)
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBe('CAPABILITY_MISSING')
  })

  it('cross-tenant probes mask as 404 on every location endpoint', async () => {
    const { userId, businessId } = await newMerchant()
    const created = await createLocation(userId, businessId)
    const locationId = created.body.location_id as string

    const intruder = (await newMerchant()).userId
    for (const [method, path, body] of [
      ['GET', `/api/v1/businesses/${businessId}/locations`, undefined],
      ['POST', `/api/v1/businesses/${businessId}/locations`, { kind: 'store', name: 'Steal' }],
      ['PATCH', `/api/v1/locations/${locationId}`, { name: 'Steal' }],
      ['POST', `/api/v1/locations/${locationId}/close`, {}],
    ] as const) {
      const res = await http.request(method, path, {
        headers: method === 'POST' && path.endsWith('/close') ? stepUp(intruder) : auth(intruder),
        ...(body ? { body } : {}),
      })
      expect(res.status, `${method} ${path}`).toBe(404)
    }

    expect((await http.request('GET', `/api/v1/businesses/${businessId}/locations`, {})).status).toBe(401)
  })
})

describe('hardening (REVIEW-OPS-001) — Batch 2 template tests', () => {
  it('H-1 regression: PATCHing an unchanged jsonb address is a SILENT no-op (D-29/D-39)', async () => {
    const { userId, businessId } = await newMerchant()
    const address = { line1: 'Hoofdstraat 1', city: 'Utrecht', postal: '3511', country: 'NL' }
    const created = await createLocation(userId, businessId, { address })
    expect(created.status).toBe(201)
    const locationId = created.body.location_id as string

    // the address has round-tripped through jsonb (keys canonicalized) — resubmit identical content
    const resubmit = await http.request('PATCH', `/api/v1/locations/${locationId}`, {
      headers: auth(userId), body: { address },
    })
    expect(resubmit.status).toBe(200)

    const { rows } = await container.pool.query(
      `SELECT count(*)::int AS n FROM operations_domain_events
       WHERE aggregate_id = $1 AND event_type = 'operations.location.updated'`, [locationId])
    expect(rows[0].n).toBe(0) // no false-positive update event
    const { rows: seq } = await container.pool.query(`SELECT sequence FROM locations WHERE id = $1`, [locationId])
    expect(Number(seq[0].sequence)).toBe(0) // and no sequence bump
  })

  it('rehydration guard: a row the domain cannot explain is an outage, not a guess', async () => {
    const { userId, businessId } = await newMerchant()
    const created = await createLocation(userId, businessId)
    const locationId = created.body.location_id as string
    // kind/status corruption is blocked by CHECK constraints themselves (rule 23 —
    // verified: the raw UPDATE dies on locations_kind_check). The guard's territory is
    // what CHECKs cannot see: the INTERIOR of jsonb documents.
    await container.pool.query(
      `UPDATE locations SET operating_window = '{"starts_at":"garbage","ends_at":"also-garbage","timezone":"Europe/Berlin"}' WHERE id = $1`,
      [locationId])

    await expect(container.operations.deps.uow.withTransaction((tx) =>
      container.operations.deps.locations.findById(tx, locationId as never),
    )).rejects.toThrow(/corrupt locations row/)
  })

  it('optimistic concurrency: a stale save trips the sequence guard', async () => {
    const { userId, businessId } = await newMerchant()
    const created = await createLocation(userId, businessId)
    const locationId = created.body.location_id as string
    const { deps } = container.operations

    // two rehydrations of the same row (no FOR UPDATE — the lost-update scenario)
    const [copyA, copyB] = await Promise.all([
      deps.uow.withTransaction((tx) => deps.locations.findById(tx, locationId as never)),
      deps.uow.withTransaction((tx) => deps.locations.findById(tx, locationId as never)),
    ])
    const first = copyA!.update({ name: 'First writer' }, { type: 'user', id: userId })
    const second = copyB!.update({ name: 'Second writer' }, { type: 'user', id: userId })
    expect(first.ok && second.ok).toBe(true)

    await deps.uow.withTransaction((tx) => deps.locations.update(tx, copyA!))
    await expect(deps.uow.withTransaction((tx) => deps.locations.update(tx, copyB!)))
      .rejects.toThrow(/concurrent modification/)
  })

  it('consumer negative path: digital products do NOT create a ghost', async () => {
    const { userId, businessId } = await newMerchant('starter')
    const product = await http.request('POST', '/api/v1/products', {
      headers: auth(userId),
      body: { business_id: businessId, title: 'Preset pack', fulfillment_kind: 'digital', default_price: { amount: 900, currency: 'EUR' } },
    })
    expect(product.status).toBe(201)
    const dispatched = await container.commerce.dispatcher.dispatchPending()
    expect(dispatched.failed).toBe(0)

    const { rows } = await container.pool.query(`SELECT count(*)::int AS n FROM locations WHERE business_id = $1`, [businessId])
    expect(rows[0].n).toBe(0)
  })

  it('Idempotency-Key replay: same key returns the same location, once', async () => {
    const { userId, businessId } = await newMerchant()
    const headers = { ...auth(userId), 'idempotency-key': 'loc-create-1' }
    const body = { kind: 'store', name: 'Idem shop' }
    const first = await http.request('POST', `/api/v1/businesses/${businessId}/locations`, { headers, body })
    const replay = await http.request('POST', `/api/v1/businesses/${businessId}/locations`, { headers, body })
    expect(first.status).toBe(201)
    expect(replay.status).toBe(201)
    expect(replay.body.location_id).toBe(first.body.location_id)
    const { rows } = await container.pool.query(
      `SELECT count(*)::int AS n FROM locations WHERE business_id = $1 AND NOT is_default`, [businessId])
    expect(rows[0].n).toBe(1)
  })

  it('ghost identity persists and dies on first merchant edit (M-1 / D-39)', async () => {
    const { userId, businessId } = await newMerchant()
    const list = await http.request('GET', `/api/v1/businesses/${businessId}/locations`, { headers: auth(userId) })
    const ghost = list.body.items[0]
    expect(ghost).toMatchObject({ ghost: true, is_default: true })

    const renamed = await http.request('PATCH', `/api/v1/locations/${ghost.location_id}`, {
      headers: auth(userId), body: { name: 'My kitchen' },
    })
    expect(renamed.status).toBe(200)
    expect(renamed.body.ghost).toBe(false) // named it → knows it → never hidden again

    const again = await http.request('GET', `/api/v1/businesses/${businessId}/locations`, { headers: auth(userId) })
    expect(again.body.items[0]).toMatchObject({ ghost: false, name: 'My kitchen', is_default: true })
  })

  it('tier downgrade: creation stays tier-gated, managing what exists does not (M-4 / D-39)', async () => {
    const { userId, businessId } = await newMerchant() // growth
    const created = await createLocation(userId, businessId)
    const locationId = created.body.location_id as string

    await container.pool.query(`UPDATE businesses SET scale_tier = 'starter' WHERE id = $1`, [businessId])
    container.entitlements.invalidate(businessId)

    const createDenied = await createLocation(userId, businessId, { name: 'One more' })
    expect(createDenied.status).toBe(403)
    expect(createDenied.body.code).toBe('CAPABILITY_MISSING')

    const rename = await http.request('PATCH', `/api/v1/locations/${locationId}`, {
      headers: auth(userId), body: { name: 'Still mine' },
    })
    expect(rename.status).toBe(200)

    const close = await http.request('POST', `/api/v1/locations/${locationId}/close`, { headers: stepUp(userId), body: {} })
    expect(close.status).toBe(200) // never stranded
  })
})

