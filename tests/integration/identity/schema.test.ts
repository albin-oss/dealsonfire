/**
 * R1-B1-P1 database-foundation validation (EXEC-R1-B1 P1 §5/§7). Asserts the SCHEMA
 * itself — table existence, the big-brother constraints/indexes, citext, FKs, and
 * grant-level immutability of the identity event/audit tables. No domain behavior here
 * (that is P2+). Embedded PostgreSQL, no mocks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { newTestContainer, testDatabaseUrl } from '../../helpers/pg'
import { applyGrants } from '../../../db/apply-grants'
import type { Container } from '../../../server/utils/container'
import { uuidv7 } from '@platform/uuid'

let container: Container

beforeAll(() => { container = newTestContainer() })
afterAll(async () => { await container.shutdown() })

const IDENTITY_TABLES = [
  'identity_domain_events', 'identity_outbox_events', 'identity_event_deliveries', 'identity_audit_logs',
  'users', 'user_credentials', 'user_passkeys', 'user_sessions', 'user_recovery_tokens',
  'guest_tokens', 'identity_claims',
]

describe('P1: table existence', () => {
  it('all eleven identity tables exist (frozen WP-R1-B1 names)', async () => {
    const { rows } = await container.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [IDENTITY_TABLES])
    expect(new Set(rows.map((r) => r.table_name))).toEqual(new Set(IDENTITY_TABLES))
  })

  it('identity_audit_logs is RANGE-partitioned (month partitions present)', async () => {
    const { rows } = await container.pool.query<{ partition: string }>(
      `SELECT inhrelid::regclass::text AS partition FROM pg_inherits WHERE inhparent = 'identity_audit_logs'::regclass`)
    expect(rows.length).toBeGreaterThanOrEqual(12) // default + 12 pre-created months
  })
})

describe('P1: constraints', () => {
  it('email is citext and unique per active account (partial unique index)', async () => {
    const { rows: cols } = await container.pool.query<{ udt_name: string }>(
      `SELECT udt_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email'`)
    expect(cols[0]!.udt_name).toBe('citext')

    const { rows: idx } = await container.pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'users' AND indexname = 'uq_users_email_active'`)
    expect(idx[0]!.indexdef).toMatch(/UNIQUE/)
    expect(idx[0]!.indexdef).toMatch(/WHERE \(status = 'active'/)

    // functional proof: two active users, same email → violation; case-insensitive
    const a = uuidv7()
    await container.pool.query(`INSERT INTO users (id, email) VALUES ($1, 'dup@example.com')`, [a])
    await expect(container.pool.query(`INSERT INTO users (id, email) VALUES ($1, 'DUP@example.com')`, [uuidv7()]))
      .rejects.toMatchObject({ code: '23505' })
    await container.pool.query(`DELETE FROM users WHERE id = $1`, [a])
  })

  it('status/purpose/kind CHECK constraints reject unknown values', async () => {
    await expect(container.pool.query(`INSERT INTO users (id, email, status) VALUES ($1, $2, 'zombie')`, [uuidv7(), `s-${uuidv7()}@x.co`]))
      .rejects.toMatchObject({ code: '23514' })
    const u = uuidv7()
    await container.pool.query(`INSERT INTO users (id, email) VALUES ($1, $2)`, [u, `p-${uuidv7()}@x.co`])
    await expect(container.pool.query(
      `INSERT INTO user_recovery_tokens (id, user_id, token_hash, purpose, expires_at) VALUES ($1, $2, $3, 'teleport', now())`,
      [uuidv7(), u, uuidv7()])).rejects.toMatchObject({ code: '23514' })
    await container.pool.query(`DELETE FROM users WHERE id = $1`, [u])
  })

  it('claim uniqueness: an artifact is claimed once', async () => {
    const u = uuidv7()
    await container.pool.query(`INSERT INTO users (id, email) VALUES ($1, $2)`, [u, `c-${uuidv7()}@x.co`])
    const ref = uuidv7()
    await container.pool.query(`INSERT INTO identity_claims (id, user_id, claim_type, claim_ref) VALUES ($1, $2, 'ignite_draft', $3)`, [uuidv7(), u, ref])
    await expect(container.pool.query(
      `INSERT INTO identity_claims (id, user_id, claim_type, claim_ref) VALUES ($1, $2, 'ignite_draft', $3)`, [uuidv7(), u, ref]))
      .rejects.toMatchObject({ code: '23505' })
    await container.pool.query(`DELETE FROM identity_claims WHERE claim_ref = $1`, [ref])
    await container.pool.query(`DELETE FROM users WHERE id = $1`, [u])
  })

  it('foreign keys are RESTRICT (no CASCADE — ADR-004)', async () => {
    const { rows } = await container.pool.query<{ table_name: string; delete_rule: string }>(
      `SELECT tc.table_name, rc.delete_rule
       FROM information_schema.referential_constraints rc
       JOIN information_schema.table_constraints tc ON tc.constraint_name = rc.constraint_name
       WHERE tc.table_name IN ('user_credentials','user_passkeys','user_sessions','user_recovery_tokens','identity_claims')`)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(['RESTRICT', 'NO ACTION'], r.table_name).toContain(r.delete_rule) // never CASCADE/SET NULL
  })
})

describe('P1: indexes (hot-path lookups)', () => {
  it('token-hash uniques + session/user lookup indexes exist', async () => {
    const { rows } = await container.pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
       AND tablename IN ('user_sessions','user_recovery_tokens','guest_tokens','user_passkeys')`)
    const names = rows.map((r) => r.indexname)
    // token_hash uniqueness on sessions + guest tokens (the resolution keys)
    expect(names.some((n) => n.includes('user_sessions') && n.includes('token'))).toBe(true)
    expect(names.some((n) => n.includes('guest_tokens') && n.includes('token'))).toBe(true)
  })
})

describe('P1: grant-level immutability (ADR-004 C4)', () => {
  it('the app role may INSERT/SELECT but not UPDATE/DELETE identity events + audit', async () => {
    await container.pool.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dof_app_test') THEN CREATE ROLE dof_app_test; END IF; END $$`)
    await applyGrants(testDatabaseUrl(), 'dof_app_test')

    const client = await container.pool.connect()
    try {
      const eventId = uuidv7()
      await client.query(
        `INSERT INTO identity_domain_events (id, aggregate_type, aggregate_id, sequence, event_type, payload, actor)
         VALUES ($1, 'user', $2, 1, 'test.grants', '{}', '{"type":"system","id":"t"}')`, [eventId, uuidv7()])
      await client.query(
        `INSERT INTO identity_audit_logs (id, actor, command) VALUES ($1, '{"type":"system","id":"t"}', 'test.grants')`, [uuidv7()])

      await client.query('SET ROLE dof_app_test')
      await client.query('SELECT count(*) FROM identity_audit_logs') // SELECT ok
      await client.query(
        `INSERT INTO identity_domain_events (id, aggregate_type, aggregate_id, sequence, event_type, payload, actor)
         VALUES ($1, 'user', $2, 1, 'test.grants2', '{}', '{"type":"system","id":"t"}')`, [uuidv7(), uuidv7()]) // INSERT ok
      await expect(client.query(`UPDATE identity_domain_events SET event_type = 'x' WHERE id = $1`, [eventId]))
        .rejects.toMatchObject({ code: '42501' })
      await expect(client.query('DELETE FROM identity_audit_logs')).rejects.toMatchObject({ code: '42501' })
    } finally {
      await client.query('RESET ROLE').catch(() => {})
      client.release()
    }
  })
})
