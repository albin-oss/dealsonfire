/**
 * Projection registry (ADR-004 C5, rule 16): every read model registers here with its
 * sources and rebuild procedure. Rebuild = shadow table + atomic rename inside one
 * transaction (PostgreSQL DDL is transactional) — zero-downtime by construction.
 * The CI drill enumerates this registry; a read model you've never rebuilt is a read
 * model you can't rebuild.
 */
import type pg from 'pg'
import { assertSqlIdentifier } from './types'
import type { Tx } from './types'

export interface ProjectionDefinition {
  /** The rm_ table name (ADR-004 rule 16 naming). */
  name: string
  /**
   * Schema/build version. Bump when schemaSql or build semantics change — deploys compare
   * the code version against the running table (see health checks) and trigger a rebuild.
   */
  version: number
  /** Event types this projection is built from (documentation + drill seeding). */
  sourceEventTypes: string[]
  /** DDL for the projection table, parameterized by table name (shadow builds use it too). */
  schemaSql(table: string): string
  /** Full build from the owning domain's event log INTO `table`. Must be deterministic. */
  build(tx: Tx, table: string): Promise<void>
}

export class ProjectionRegistry {
  private readonly definitions = new Map<string, ProjectionDefinition>()

  register(definition: ProjectionDefinition): void {
    if (!definition.name.startsWith('rm_')) {
      throw new Error(`projection table must use the rm_ prefix (ADR-004 rule 16): ${definition.name}`)
    }
    assertSqlIdentifier(definition.name)
    if (this.definitions.has(definition.name)) {
      throw new Error(`projection already registered: ${definition.name}`)
    }
    this.definitions.set(definition.name, definition)
  }

  list(): ProjectionDefinition[] {
    return [...this.definitions.values()]
  }

  get(name: string): ProjectionDefinition | undefined {
    return this.definitions.get(name)
  }

  /**
   * Zero-downtime rebuild: build into a shadow table, then atomically swap. Readers see
   * either the old or the new projection, never a partial one.
   */
  async rebuild(pool: pg.Pool, name: string): Promise<void> {
    const definition = this.definitions.get(name)
    if (!definition) throw new Error(`unknown projection: ${name}`)
    const shadow = assertSqlIdentifier(`${name}__shadow`)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`DROP TABLE IF EXISTS ${shadow}`)
      await client.query(definition.schemaSql(shadow))
      await definition.build(client, shadow)
      await client.query(`DROP TABLE IF EXISTS ${definition.name}`)
      await client.query(`ALTER TABLE ${shadow} RENAME TO ${definition.name}`)
      // ALTER TABLE RENAME does not rename indexes (REVIEW-002 M-2, deep form): shadow-
      // suffixed index names would collide on the NEXT rebuild. Normalize them here.
      const { rows: indexes } = await client.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = $1`,
        [definition.name],
      )
      for (const { indexname } of indexes) {
        if (!indexname.includes('__shadow')) continue
        const normalized = assertSqlIdentifier(indexname.replaceAll('__shadow', ''))
        await client.query(`ALTER INDEX ${assertSqlIdentifier(indexname)} RENAME TO ${normalized}`)
      }
      // Version stamp via table comment — metadata, no schema/table additions (IMP-PLT-001).
      // COMMENT is a utility statement (no bind parameters); the value is a coerced integer.
      await client.query(`COMMENT ON TABLE ${definition.name} IS 'projection v${Number(definition.version)}'`)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Ensure a projection table exists (initial deploy) without destroying existing data.
   * Existence-checked, not regex-rewritten (REVIEW-002 M-2): schemaSql may be
   * multi-statement (table + indexes) and is executed verbatim only when absent.
   */
  async ensure(pool: pg.Pool, name: string): Promise<void> {
    const definition = this.definitions.get(name)
    if (!definition) throw new Error(`unknown projection: ${name}`)
    const { rows } = await pool.query<{ t: string | null }>('SELECT to_regclass($1) AS t', [definition.name])
    if (rows[0]?.t !== null) return // already deployed — never touch a live projection here
    await pool.query(definition.schemaSql(definition.name))
  }

  /** Running version of a projection (from its table comment), or null if absent/unstamped. */
  async runningVersion(pool: pg.Pool, name: string): Promise<number | null> {
    const { rows } = await pool.query<{ comment: string | null }>(
      `SELECT obj_description(to_regclass($1), 'pg_class') AS comment`,
      [assertSqlIdentifier(name)],
    )
    const match = /^projection v(\d+)$/.exec(rows[0]?.comment ?? '')
    return match ? Number(match[1]) : null
  }
}
