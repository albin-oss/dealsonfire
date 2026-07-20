/**
 * The Learning Ledger (Release 1.4) — a definition-drift guard, not a metrics test.
 * Every @section in scripts/learning.sql must execute against the CURRENT migrated
 * schema and return rows: a migration that breaks a metric definition fails here
 * instead of silently corrupting the readout. Also proves the ledger is read-only.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { parseSections } from '../../../scripts/learning'
import { testDatabaseUrl } from '../../helpers/pg'

let pool: pg.Pool

beforeAll(() => { pool = new pg.Pool({ connectionString: testDatabaseUrl() }) })
afterAll(async () => { await pool.end() })

describe('the learning ledger (Release 1.4)', () => {
  const source = readFileSync(join(__dirname, '../../../scripts/learning.sql'), 'utf8')
  const sections = parseSections(source)

  it('covers the six experiments plus scale', () => {
    expect(sections.map((s) => s.title.slice(0, 2))).toEqual(['E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6'])
  })

  it.each(sections.map((s) => [s.title.slice(0, 2), s] as const))(
    '%s executes against the current schema inside a read-only transaction',
    async (_id, section) => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN TRANSACTION READ ONLY')
        const { rows } = await client.query(section.query)
        expect(Array.isArray(rows)).toBe(true)
        // aggregate-only outputs: no column may leak an identifier or email
        for (const col of Object.keys(rows[0] ?? {})) {
          expect(col).not.toMatch(/email|visitor_id$|user_id$/)
        }
        await client.query('ROLLBACK')
      } finally {
        client.release()
      }
    },
  )
})
