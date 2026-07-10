/**
 * Projection registry against real PostgreSQL (Batch 1): proves the shadow+rename rebuild
 * is atomic and repeatable — the machinery Commerce Batch 8 registers real projections into.
 * Scratch tables are dropped so the manifest↔DB parity test stays truthful.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { ProjectionRegistry, type ProjectionDefinition } from '@platform/projection-registry'
import { testDatabaseUrl } from '../helpers/pg'

let pool: pg.Pool
const registry = new ProjectionRegistry()

const definition: ProjectionDefinition = {
  name: 'rm_drill_probe',
  version: 1,
  sourceEventTypes: ['test.probe'],
  schemaSql: (table) => `CREATE TABLE ${table} (id int PRIMARY KEY, label text NOT NULL)`,
  // Deterministic build (stands in for an event-log replay)
  build: async (tx, table) => {
    const client = tx as pg.PoolClient
    await client.query(`INSERT INTO ${table} (id, label) VALUES (1, 'one'), (2, 'two')`)
  },
}

beforeAll(() => {
  pool = new pg.Pool({ connectionString: testDatabaseUrl() })
  registry.register(definition)
})
afterAll(async () => {
  await pool.query('DROP TABLE IF EXISTS rm_drill_probe')
  await pool.query('DROP TABLE IF EXISTS rm_drill_probe__shadow')
  await pool.end()
})

describe('shadow+rename rebuild (ADR-004 rule 16)', () => {
  it('ensure creates the table; rebuild replaces drifted data atomically', async () => {
    await registry.ensure(pool, 'rm_drill_probe')
    const empty = await pool.query('SELECT count(*)::int AS n FROM rm_drill_probe')
    expect(empty.rows[0].n).toBe(0)

    // First rebuild populates from the (simulated) event log
    await registry.rebuild(pool, 'rm_drill_probe')
    const built = await pool.query('SELECT label FROM rm_drill_probe ORDER BY id')
    expect(built.rows.map((r: { label: string }) => r.label)).toEqual(['one', 'two'])

    // Corrupt the projection (the read-model-is-wrong scenario) → rebuild restores truth
    await pool.query(`UPDATE rm_drill_probe SET label = 'corrupted'`)
    await pool.query(`INSERT INTO rm_drill_probe (id, label) VALUES (99, 'stray')`)
    await registry.rebuild(pool, 'rm_drill_probe')
    const rebuilt = await pool.query('SELECT id, label FROM rm_drill_probe ORDER BY id')
    expect(rebuilt.rows).toEqual([{ id: 1, label: 'one' }, { id: 2, label: 'two' }])

    // No shadow residue
    const shadow = await pool.query(`SELECT to_regclass('rm_drill_probe__shadow') AS t`)
    expect(shadow.rows[0].t).toBeNull()
  })

  it('a failing build rolls back and leaves the live projection untouched', async () => {
    const failing: ProjectionDefinition = {
      name: 'rm_drill_failing',
      version: 1,
      sourceEventTypes: [],
      schemaSql: (table) => `CREATE TABLE ${table} (id int PRIMARY KEY)`,
      build: async () => { throw new Error('builder exploded') },
    }
    registry.register(failing)
    await expect(registry.rebuild(pool, 'rm_drill_failing')).rejects.toThrow('builder exploded')
    const table = await pool.query(`SELECT to_regclass('rm_drill_failing') AS t, to_regclass('rm_drill_failing__shadow') AS s`)
    expect(table.rows[0].t).toBeNull() // never existed
    expect(table.rows[0].s).toBeNull() // shadow rolled back with the transaction

    // The previously built projection is unaffected by the sibling failure
    const intact = await pool.query('SELECT count(*)::int AS n FROM rm_drill_probe')
    expect(intact.rows[0].n).toBe(2)
  })
})
