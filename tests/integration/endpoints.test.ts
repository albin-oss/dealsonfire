import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../server/utils/container'
import { newTestContainer, truncateAll } from '../helpers/pg'
import { startTestApp, type TestHttp } from '../helpers/app'
import { uuidv7 } from '@domains/merchant/shared-kernel/uuid'

let container: Container
let http: TestHttp

const auth = (userId: string) => ({ 'x-dof-user-id': userId })

async function createBusiness(userId: string, name = 'Rosa Knits') {
  const res = await http.request('POST', '/api/v1/businesses', {
    headers: auth(userId),
    body: { display_name: name, business_type: 'individual' },
  })
  expect(res.status).toBe(201)
  return res.body as { business_id: string }
}

async function createStore(userId: string, businessId: string, body: Record<string, unknown> = { name: 'Rosa Knits' }) {
  return http.request('POST', `/api/v1/businesses/${businessId}/stores`, { headers: auth(userId), body })
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

describe('auth', () => {
  it('401 AUTH_REQUIRED without a session on every endpoint', async () => {
    for (const [method, path] of [
      ['GET', '/api/v1/workspace'],
      ['POST', '/api/v1/businesses'],
      ['POST', `/api/v1/businesses/${uuidv7()}/stores`],
      ['PUT', `/api/v1/stores/${uuidv7()}/brand-kit`],
      ['POST', `/api/v1/stores/${uuidv7()}/publish`],
    ] as const) {
      const res = await http.request(method, path, method === 'GET' ? {} : { body: {} })
      expect(res.status, `${method} ${path}`).toBe(401)
      expect(res.body.code).toBe('AUTH_REQUIRED')
    }
  })
})

describe('Definition-of-Done flow: workspace → business → store → brand kit → publish', () => {
  it('runs end to end with events, outbox, and audit', async () => {
    const userId = uuidv7()

    // 1. empty workspace (DECISIONS D-05)
    const empty = await http.request('GET', '/api/v1/workspace', { headers: auth(userId) })
    expect(empty.status).toBe(200)
    expect(empty.body).toEqual({ merchant: null, businesses: [] })

    // 2. create business
    const business = await createBusiness(userId)

    // 3. create store (handle derived from name)
    const store = await createStore(userId, business.business_id)
    expect(store.status).toBe(201)
    expect(store.body.handle).toBe('rosa-knits')
    expect(store.body.status).toBe('draft')
    expect(store.body.enforcement_hold).toBe('none')

    // 4. set brand kit (whole-value PUT)
    const kit = await http.request('PUT', `/api/v1/stores/${store.body.store_id}/brand-kit`, {
      headers: auth(userId),
      body: { name: 'Rosa Knits Studio', palette: { primary: '#AA3311' } },
    })
    expect(kit.status).toBe(200)
    expect(kit.body.palette.primary).toBe('#AA3311')

    // 5. publish
    const published = await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: auth(userId) })
    expect(published.status).toBe(200)
    expect(published.body.status).toBe('live')
    expect(published.body.store_url).toBe('/s/rosa-knits')
    expect(published.body.published_at).toBeTruthy()

    // 6+7. store.published event + outbox row written transactionally
    const { rows: events } = await container.pool.query(
      `SELECT e.event_type, e.actor, o.status AS outbox_status
       FROM domain_events e JOIN outbox_events o ON o.domain_event_id = e.id
       WHERE e.event_type = 'merchant.store.published'`,
    )
    expect(events).toHaveLength(1)
    expect(events[0].actor).toMatchObject({ type: 'user', id: userId })

    // 8. audit rows for every command
    const { rows: audits } = await container.pool.query('SELECT command FROM audit_logs ORDER BY created_at')
    const commands = audits.map((a: { command: string }) => a.command)
    expect(commands).toEqual(expect.arrayContaining([
      'merchant.business.create', 'merchant.store.create', 'merchant.store.brand_kit.update', 'merchant.store.publish',
    ]))

    // workspace reflects it all
    const full = await http.request('GET', '/api/v1/workspace', { headers: auth(userId) })
    expect(full.body.merchant).not.toBeNull()
    expect(full.body.businesses).toHaveLength(1)
    expect(full.body.businesses[0].membership.roles).toEqual(['owner'])
    expect(full.body.businesses[0].capabilities).toContain('store.core')
    expect(full.body.businesses[0].capabilities).not.toContain('stores.multiple')
    expect(full.body.businesses[0].stores[0].status).toBe('live')

    // publish is idempotent
    const again = await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: auth(userId) })
    expect(again.status).toBe(200)
  })
})

describe('gate rejections', () => {
  it('422 VALIDATION_FAILED on malformed body', async () => {
    const res = await http.request('POST', '/api/v1/businesses', {
      headers: auth(uuidv7()),
      body: { display_name: '', business_type: 'llc' },
    })
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('VALIDATION_FAILED')
    expect(res.body.details.issues.length).toBeGreaterThan(0)
  })

  it('403 PERMISSION_DENIED: staff role cannot create or publish stores', async () => {
    const owner = uuidv7()
    const staffUser = uuidv7()
    const business = await createBusiness(owner)
    const store = await createStore(owner, business.business_id)
    await container.pool.query(
      `INSERT INTO staff_memberships (id, business_id, principal_type, principal_id, roles, status)
       VALUES ($1, $2, 'user', $3, '{staff}', 'active')`,
      [uuidv7(), business.business_id, staffUser],
    )
    const denied = await createStore(staffUser, business.business_id, { name: 'Side Store' })
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBe('PERMISSION_DENIED')
    const publishDenied = await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: auth(staffUser) })
    expect(publishDenied.status).toBe(403)
    expect(publishDenied.body.code).toBe('PERMISSION_DENIED')
  })

  it('403 CAPABILITY_MISSING: second store requires stores.multiple', async () => {
    const userId = uuidv7()
    const business = await createBusiness(userId)
    expect((await createStore(userId, business.business_id)).status).toBe(201)
    const second = await createStore(userId, business.business_id, { name: 'Second Store' })
    expect(second.status).toBe(403)
    expect(second.body.code).toBe('CAPABILITY_MISSING')
    expect(second.body.details.capability).toBe('stores.multiple')
  })

  it('403 STANDING_BLOCKED: suspended business cannot write; restricted cannot publish', async () => {
    const userId = uuidv7()
    const business = await createBusiness(userId)
    const store = await createStore(userId, business.business_id)

    await container.pool.query(`UPDATE businesses SET standing = 'suspended' WHERE id = $1`, [business.business_id])
    container.entitlements.invalidate(business.business_id)
    const denied = await createStore(userId, business.business_id, { name: 'Nope' })
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBe('STANDING_BLOCKED')

    await container.pool.query(`UPDATE businesses SET standing = 'restricted' WHERE id = $1`, [business.business_id])
    container.entitlements.invalidate(business.business_id)
    const publishDenied = await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: auth(userId) })
    expect(publishDenied.status).toBe(403)
    expect(publishDenied.body.code).toBe('STANDING_BLOCKED')
  })

  it('423 ENFORCEMENT_HOLD: hold blocks publish independently of status (ADR §7.2)', async () => {
    const userId = uuidv7()
    const business = await createBusiness(userId)
    const store = await createStore(userId, business.business_id)
    await container.pool.query(`UPDATE stores SET enforcement_hold = 'under_review' WHERE id = $1`, [store.body.store_id])
    const denied = await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: auth(userId) })
    expect(denied.status).toBe(423)
    expect(denied.body.code).toBe('ENFORCEMENT_HOLD')
  })

  it('409 STORE_NOT_PUBLISHABLE with explainable missing list', async () => {
    const userId = uuidv7()
    const business = await createBusiness(userId)
    const store = await createStore(userId, business.business_id)
    await container.pool.query(`DELETE FROM brand_kits WHERE owner_type = 'store' AND owner_id = $1`, [store.body.store_id])
    const denied = await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: auth(userId) })
    expect(denied.status).toBe(409)
    expect(denied.body.code).toBe('STORE_NOT_PUBLISHABLE')
    expect(denied.body.details.missing).toContain('brand kit')
  })

  it('409 HANDLE_TAKEN with suggestions for explicit handles', async () => {
    const userA = uuidv7()
    const userB = uuidv7()
    const businessA = await createBusiness(userA)
    const businessB = await createBusiness(userB, 'Other Business')
    expect((await createStore(userA, businessA.business_id, { name: 'X', handle: 'rosa-knits' })).status).toBe(201)
    const taken = await createStore(userB, businessB.business_id, { name: 'Y', handle: 'rosa-knits' })
    expect(taken.status).toBe(409)
    expect(taken.body.code).toBe('HANDLE_TAKEN')
    expect(taken.body.details.suggestions.length).toBeGreaterThan(0)
  })

  it('404 NOT_FOUND masks other tenants’ businesses and stores', async () => {
    const owner = uuidv7()
    const intruder = uuidv7()
    const business = await createBusiness(owner)
    const store = await createStore(owner, business.business_id)
    await createBusiness(intruder, 'Intruder Biz') // intruder is a merchant, just not a member here

    const probe = await createStore(intruder, business.business_id, { name: 'Probe' })
    expect(probe.status).toBe(404)
    const storeProbe = await http.request('POST', `/api/v1/stores/${store.body.store_id}/publish`, { headers: auth(intruder) })
    expect(storeProbe.status).toBe(404)
  })
})

describe('Idempotency-Key (BLUEPRINT §4, DECISIONS D-01)', () => {
  it('replays the stored response; exactly one resource is created', async () => {
    const userId = uuidv7()
    const business = await createBusiness(userId)
    const headers = { ...auth(userId), 'idempotency-key': 'store-create-1' }
    const body = { name: 'Idem Store' }

    const first = await http.request('POST', `/api/v1/businesses/${business.business_id}/stores`, { headers, body })
    expect(first.status).toBe(201)

    // Same key + same body → replay of the stored 201, NOT a CAPABILITY_MISSING for a second store
    const replay = await http.request('POST', `/api/v1/businesses/${business.business_id}/stores`, { headers, body })
    expect(replay.status).toBe(201)
    expect(replay.body.store_id).toBe(first.body.store_id)

    const { rows } = await container.pool.query('SELECT count(*)::int AS n FROM stores WHERE business_id = $1', [business.business_id])
    expect(rows[0].n).toBe(1)

    // Same key + different body → 409 IDEMPOTENCY_CONFLICT
    const conflict = await http.request('POST', `/api/v1/businesses/${business.business_id}/stores`, {
      headers, body: { name: 'Different Store' },
    })
    expect(conflict.status).toBe(409)
    expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('a failed request releases the key so the client can retry', async () => {
    const userId = uuidv7()
    const business = await createBusiness(userId)
    await createStore(userId, business.business_id, { name: 'First' })

    // Second store is denied (CAPABILITY_MISSING) — the key must be released, not wedged.
    const headers = { ...auth(userId), 'idempotency-key': 'retry-1' }
    const body = { name: 'Second Store' }
    const denied = await http.request('POST', `/api/v1/businesses/${business.business_id}/stores`, { headers, body })
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBe('CAPABILITY_MISSING')

    const retry = await http.request('POST', `/api/v1/businesses/${business.business_id}/stores`, { headers, body })
    expect(retry.status).toBe(403) // same denial, NOT a 409 in-flight/conflict from a wedged key
    expect(retry.body.code).toBe('CAPABILITY_MISSING')
  })
})
