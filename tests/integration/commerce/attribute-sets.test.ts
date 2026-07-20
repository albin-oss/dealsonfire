/**
 * Catalog attribute sets + brand refs (PROMPT-016) over real HTTP + embedded PG. Create/list,
 * typed-attribute validation surfaced via the set, brand idempotency, gate + tenant masking.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { startTestApp, type TestHttp } from '../../helpers/app'
import { SESSION_COOKIE } from '@domains/identity/application/session-service'
import { uuidv7 } from '@platform/uuid'

let container: Container
let http: TestHttp

async function merchant(): Promise<{ cookie: string; businessId: string }> {
  const reg = await http.request('POST', '/api/v1/auth/register', { body: { email: `a-${uuidv7()}@example.com`, password: 'a long passphrase' } })
  const set = reg.headers.get('set-cookie')!
  const cookie = `${SESSION_COOKIE}=${decodeURIComponent(new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(set)![1]!)}`
  const biz = await http.request('POST', '/api/v1/businesses', { headers: { cookie }, body: { business_type: 'individual', display_name: 'Rosa' } })
  return { cookie, businessId: biz.body.business_id }
}

beforeAll(async () => { container = newTestContainer(); setContainer(container); http = await startTestApp() })
afterAll(async () => { await http.close(); setContainer(null); await container.shutdown() })
beforeEach(async () => { await truncateAll(container.pool); (container.rateLimiter as { reset?: () => void }).reset?.() })

describe('attribute sets', () => {
  it('creates, persists, audits, and lists a set', async () => {
    const { cookie, businessId } = await merchant()
    const create = await http.request('POST', '/api/v1/attribute-sets', {
      headers: { cookie },
      body: { business_id: businessId, name: 'Apparel', definitions: [
        { key: 'material', label: 'Material', type: 'text', required: true },
        { key: 'size', label: 'Size', type: 'select', allowedValues: ['s', 'm', 'l'] },
      ] },
    })
    expect(create.status).toBe(201)
    expect(create.body.id).toBeTruthy()

    const list = await http.request('GET', `/api/v1/attribute-sets?business_id=${businessId}`, { headers: { cookie } })
    expect(list.body.items).toHaveLength(1)
    expect(list.body.items[0]).toMatchObject({ name: 'Apparel', status: 'active' })

    const audit = await container.pool.query(`SELECT command FROM commerce_audit_logs WHERE command = 'commerce.attribute_set.create'`)
    expect(audit.rows.length).toBe(1)
  })

  it('rejects an invalid definition (select without values)', async () => {
    const { cookie, businessId } = await merchant()
    const bad = await http.request('POST', '/api/v1/attribute-sets', {
      headers: { cookie }, body: { business_id: businessId, name: 'Bad', definitions: [{ key: 's', label: 'S', type: 'select' }] },
    })
    expect(bad.status).toBe(422)
  })

  it('masks another tenant’s business as 403/404', async () => {
    const a = await merchant()
    const b = await merchant()
    const cross = await http.request('POST', '/api/v1/attribute-sets', {
      headers: { cookie: a.cookie }, body: { business_id: b.businessId, name: 'X', definitions: [] },
    })
    expect([403, 404]).toContain(cross.status)
  })
})

describe('brand refs', () => {
  it('adds brands idempotently and lists them', async () => {
    const { cookie, businessId } = await merchant()
    const first = await http.request('POST', '/api/v1/brands', { headers: { cookie }, body: { business_id: businessId, name: 'Nike' } })
    expect(first.status).toBe(201)
    const again = await http.request('POST', '/api/v1/brands', { headers: { cookie }, body: { business_id: businessId, name: 'Nike' } })
    expect(again.body.id).toBe(first.body.id) // idempotent by (business, name)

    const list = await http.request('GET', `/api/v1/brands?business_id=${businessId}`, { headers: { cookie } })
    expect(list.body.items.map((b: { name: string }) => b.name)).toEqual(['Nike'])
  })

  it('requires a session', async () => {
    expect((await http.request('GET', `/api/v1/brands?business_id=${uuidv7()}`)).status).toBe(401)
  })
})
