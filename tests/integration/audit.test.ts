import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../server/utils/container'
import { newTestContainer, truncateAll } from '../helpers/pg'
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

describe('audit log (BLUEPRINT §9, DECISIONS D-10)', () => {
  it('accepted commands write actor-carrying audit rows inside the command transaction', async () => {
    const userId = uuidv7()
    const biz = await container.commands.createBusiness({
      actor: { type: 'user', id: userId }, userId, displayName: 'Audit Biz', businessType: 'individual',
      requestContext: { correlation_id: 'corr-1', ip: '203.0.113.9' },
    })
    expect(biz.ok).toBe(true)

    const { rows } = await container.pool.query(
      `SELECT command, actor, sensitivity, business_id, context FROM audit_logs`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].command).toBe('merchant.business.create')
    expect(rows[0].actor).toMatchObject({ type: 'user', id: userId })
    expect(rows[0].sensitivity).toBe('normal')
    expect(rows[0].context).toMatchObject({ correlation_id: 'corr-1', ip: '203.0.113.9' })
    expect(rows[0].business_id).toBe(biz.ok ? biz.value.businessId : null)
  })

  it('a failed command leaves NO audit row and NO partial writes (atomicity)', async () => {
    const userId = uuidv7()
    const biz = await container.commands.createBusiness({
      actor: { type: 'user', id: userId }, userId, displayName: 'Audit Biz', businessType: 'individual',
    })
    if (!biz.ok) throw new Error('setup failed')
    const first = await container.commands.createStore({
      actor: { type: 'user', id: userId }, userId, businessId: biz.value.businessId, name: 'One',
    })
    expect(first.ok).toBe(true)

    const before = await container.pool.query('SELECT count(*)::int AS n FROM audit_logs')
    const denied = await container.commands.createStore({
      actor: { type: 'user', id: userId }, userId, businessId: biz.value.businessId, name: 'Two',
    })
    expect(denied.ok).toBe(false) // CAPABILITY_MISSING (stores.multiple)

    const after = await container.pool.query('SELECT count(*)::int AS n FROM audit_logs')
    expect(after.rows[0].n).toBe(before.rows[0].n) // no audit row for the denied command
    const stores = await container.pool.query('SELECT count(*)::int AS n FROM stores WHERE business_id = $1', [biz.value.businessId])
    expect(stores.rows[0].n).toBe(1) // rollback left no partial store
  })

  it('denied SENSITIVE commands are audited via recordDenied (outside any transaction)', async () => {
    await container.audit.recordDenied({
      businessId: null,
      actor: { type: 'user', id: uuidv7() },
      command: 'merchant.business.transfer',
      sensitivity: 'sensitive',
      target: {},
      context: { correlation_id: 'corr-2' },
      denialCode: 'STEP_UP_REQUIRED',
    })
    const { rows } = await container.pool.query(`SELECT command, sensitivity, context FROM audit_logs`)
    expect(rows).toHaveLength(1)
    expect(rows[0].command).toBe('merchant.business.transfer')
    expect(rows[0].context).toMatchObject({ denied: true, denial_code: 'STEP_UP_REQUIRED' })
  })

  it('audit rows land in the correct monthly partition', async () => {
    await container.audit.recordDenied({
      businessId: null, actor: { type: 'system', id: 'test' }, command: 'x',
      sensitivity: 'sensitive', target: {}, denialCode: 'X',
    })
    const { rows } = await container.pool.query(
      `SELECT tableoid::regclass::text AS partition FROM audit_logs LIMIT 1`,
    )
    expect(rows[0].partition).toMatch(/^audit_logs_\d{4}_\d{2}$/)
  })
})
