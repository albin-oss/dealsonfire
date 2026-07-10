import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { migrate } from '../../db/migrate'
import { seed } from '../../db/seed'
import { CAPABILITY_SEED } from '../../db/seeds/capability-registry'
import { testDatabaseUrl } from '../helpers/pg'

const EXPECTED_TABLES = [
  'merchant_accounts', 'businesses', 'store_handles', 'stores', 'brand_kits',
  'storefront_configs', 'staff_memberships', 'capabilities', 'business_entitlements',
  'domain_events', 'outbox_events', 'event_deliveries', 'audit_logs',
  'request_idempotency_keys', 'schema_migrations',
  'commerce_domain_events', 'commerce_outbox_events', 'commerce_event_deliveries', 'commerce_audit_logs',
  'products', 'product_variants', 'product_media',
]

describe('migration 0001 + capability seed', () => {
  let pool: pg.Pool
  beforeAll(() => { pool = new pg.Pool({ connectionString: testDatabaseUrl() }) })
  afterAll(() => pool.end())

  it('created every kernel table', async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    )
    const names = rows.map((r) => r.table_name)
    for (const table of EXPECTED_TABLES) expect(names, `missing table ${table}`).toContain(table)
  })

  it('audit_logs is range-partitioned with partitions ready (DECISIONS D-02)', async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM pg_inherits
       JOIN pg_class parent ON parent.oid = inhparent WHERE parent.relname = 'audit_logs'`,
    )
    expect(rows[0].n).toBeGreaterThanOrEqual(12)
  })

  it('re-running migrate is a no-op (forward-only, recorded)', async () => {
    const applied = await migrate(testDatabaseUrl())
    expect(applied).toEqual([])
  })

  it('seed is idempotent: same content does not bump versions', async () => {
    await seed(testDatabaseUrl())
    const { rows } = await pool.query<{ key: string; version: number }>('SELECT key, version FROM capabilities')
    expect(rows).toHaveLength(CAPABILITY_SEED.length)
    for (const row of rows) expect(row.version, `${row.key} version bumped by identical seed`).toBe(1)
  })

  it('enforces the exactly-one-owner partial unique index', async () => {
    const { rows: [biz] } = await pool.query(
      `INSERT INTO businesses (id, business_type, display_name) VALUES (gen_random_uuid(), 'individual', 'T') RETURNING id`,
    )
    const insertOwner = () => pool.query(
      `INSERT INTO staff_memberships (id, business_id, principal_type, principal_id, roles, status)
       VALUES (gen_random_uuid(), $1, 'user', gen_random_uuid(), '{owner}', 'active')`,
      [biz.id],
    )
    await insertOwner()
    await expect(insertOwner()).rejects.toThrow(/idx_one_owner_per_business/)
    await pool.query('DELETE FROM staff_memberships WHERE business_id = $1', [biz.id])
    await pool.query('DELETE FROM businesses WHERE id = $1', [biz.id])
  })
})
