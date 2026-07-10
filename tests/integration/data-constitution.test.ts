/** ADR-004 pre-Module-2 changes — integration verification (PROMPT 009 §6). */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setContainer, type Container } from '../../server/utils/container'
import { newTestContainer, truncateAll, testDatabaseUrl } from '../helpers/pg'
import { startTestApp } from '../helpers/app'
import { applyGrants } from '../../db/apply-grants'
import { migrate } from '../../db/migrate'
import { manifestTableNames } from '@contracts/data/manifest'
import { asBusinessId } from '@domains/merchant/shared-kernel/ids'
import { uuidv7 } from '@domains/merchant/shared-kernel/uuid'
import { EVENT } from '@domains/merchant/core/domain/events'

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

describe('C1: event traceability end to end', () => {
  it('command-produced events persist the request correlation id', async () => {
    const http = await startTestApp()
    try {
      const userId = uuidv7()
      const correlationId = uuidv7()
      const res = await http.request('POST', '/api/v1/businesses', {
        headers: { 'x-dof-user-id': userId, 'x-request-id': correlationId },
        body: { display_name: 'Trace Biz', business_type: 'individual' },
      })
      expect(res.status).toBe(201)

      const { rows } = await container.pool.query(
        'SELECT event_type, correlation_id, causation_id FROM domain_events ORDER BY id',
      )
      expect(rows.length).toBeGreaterThanOrEqual(3) // onboarded + business.created + staff.joined
      for (const row of rows) {
        expect(row.correlation_id, row.event_type).toBe(correlationId)
        expect(row.causation_id).toBeNull() // command-produced: no causing event
      }
    } finally {
      await http.close()
    }
  })

  it('consumers chain: policy events inherit correlation and set causation to the source event', async () => {
    const userId = uuidv7()
    const biz = await container.commands.createBusiness({
      actor: { type: 'user', id: userId }, userId, displayName: 'Chain Biz', businessType: 'individual',
      requestContext: { correlation_id: uuidv7() },
    })
    if (!biz.ok) throw new Error('setup failed')
    await container.commands.createStore({
      actor: { type: 'user', id: userId }, userId, businessId: biz.value.businessId, name: 'Chain Store',
      requestContext: { correlation_id: uuidv7() },
    })

    // Suspend via aggregate + event store with a fresh correlation (the admin request)
    const adminCorrelation = uuidv7()
    await container.deps.uow.withTransaction(async (tx) => {
      const business = await container.deps.businesses.findById(tx, asBusinessId(biz.value.businessId), { forUpdate: true })
      const changed = business!.changeStanding('suspended', 'fraud_signals', { type: 'admin', id: 'admin-1' })
      if (!changed.ok) throw new Error(changed.error.message)
      await container.deps.businesses.update(tx, business!)
      await container.deps.eventStore.append(tx, business!.pullPendingEvents(), { correlationId: adminCorrelation })
    })

    await container.dispatcher.dispatchPending()

    const { rows: [source] } = await container.pool.query(
      'SELECT id, correlation_id FROM domain_events WHERE event_type = $1', [EVENT.BUSINESS_STANDING_CHANGED],
    )
    const { rows: [consequence] } = await container.pool.query(
      'SELECT correlation_id, causation_id FROM domain_events WHERE event_type = $1', [EVENT.STORE_ENFORCEMENT_HOLD_CHANGED],
    )
    expect(source.correlation_id).toBe(adminCorrelation)
    expect(consequence.correlation_id).toBe(adminCorrelation) // inherited through the consumer
    expect(consequence.causation_id).toBe(source.id) // chained to the causing event
  })
})

describe('C2: manifest matches the real database', () => {
  it('every base table in the database is manifested, and vice versa', async () => {
    const { rows } = await container.pool.query<{ table_name: string }>(
      `SELECT c.relname AS table_name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
         AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid)`, // exclude partitions
    )
    const actual = new Set(rows.map((r) => r.table_name))
    const manifested = manifestTableNames()
    for (const table of actual) expect(manifested.has(table), `unmanifested table: ${table}`).toBe(true)
    for (const table of manifested) expect(actual.has(table), `manifested but missing: ${table}`).toBe(true)
  })
})

describe('C4: immutability grants hold at the database level', () => {
  it('the app role can INSERT/SELECT but not UPDATE/DELETE audit_logs and domain_events', async () => {
    await container.pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dof_app_test') THEN CREATE ROLE dof_app_test; END IF;
      END $$`)
    await applyGrants(testDatabaseUrl(), 'dof_app_test')

    const client = await container.pool.connect()
    try {
      // Seed one row of each as the privileged owner
      const eventId = uuidv7()
      await client.query(
        `INSERT INTO domain_events (id, aggregate_type, aggregate_id, sequence, event_type, payload, actor)
         VALUES ($1, 'store', $2, 1, 'test.grants', '{}', '{"type":"system","id":"t"}')`,
        [eventId, uuidv7()],
      )
      await client.query(
        `INSERT INTO audit_logs (id, actor, command) VALUES ($1, '{"type":"system","id":"t"}', 'test.grants')`,
        [uuidv7()],
      )

      await client.query('SET ROLE dof_app_test')
      // SELECT + INSERT allowed
      await client.query('SELECT count(*) FROM audit_logs')
      await client.query(
        `INSERT INTO domain_events (id, aggregate_type, aggregate_id, sequence, event_type, payload, actor)
         VALUES ($1, 'store', $2, 1, 'test.grants2', '{}', '{"type":"system","id":"t"}')`,
        [uuidv7(), uuidv7()],
      )
      // UPDATE / DELETE denied (42501 insufficient_privilege)
      await expect(client.query(`UPDATE domain_events SET event_type = 'tampered' WHERE id = $1`, [eventId]))
        .rejects.toMatchObject({ code: '42501' })
      await expect(client.query('DELETE FROM domain_events WHERE id = $1', [eventId]))
        .rejects.toMatchObject({ code: '42501' })
      await expect(client.query(`UPDATE audit_logs SET command = 'tampered'`)).rejects.toMatchObject({ code: '42501' })
      await expect(client.query('DELETE FROM audit_logs')).rejects.toMatchObject({ code: '42501' })
    } finally {
      await client.query('RESET ROLE').catch(() => {})
      client.release()
    }
  })
})

describe('rule 17: migration checksum tampering is refused', () => {
  it('re-running after editing an applied migration fails with the ADR-004 message', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dof-mig-'))
    const file = join(dir, '0001_tamper_test.sql')
    writeFileSync(file, 'CREATE TABLE IF NOT EXISTS tamper_probe (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())')
    await migrate(testDatabaseUrl(), dir)

    writeFileSync(file, 'CREATE TABLE IF NOT EXISTS tamper_probe_v2 (id uuid PRIMARY KEY)')
    await expect(migrate(testDatabaseUrl(), dir)).rejects.toThrow(/modified after being applied/)

    await container.pool.query('DROP TABLE IF EXISTS tamper_probe')
    await container.pool.query(`DELETE FROM schema_migrations WHERE name = '0001_tamper_test.sql'`)
  })
})
