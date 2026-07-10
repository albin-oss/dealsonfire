/**
 * Repository base (IMP-PLT-001 shared database infrastructure). Deliberately thin:
 * aggregates map row↔domain in their own repositories (BLUEPRINT-001 §3); this base only
 * removes the query boilerplate every Pg repository repeats. No ORM, no lazy loading —
 * whole-aggregate load/save stays the law (ADR-001 §5.4).
 */
import type pg from 'pg'
import type { Tx } from './types'
import { asClient } from './db'

export abstract class PgRepositoryBase {
  protected client(tx: Tx): pg.PoolClient {
    return asClient(tx)
  }

  /** Exactly one row — infrastructure fault otherwise (constraint should have prevented it). */
  protected async one<R extends pg.QueryResultRow>(tx: Tx, sql: string, params: unknown[]): Promise<R> {
    const { rows } = await this.client(tx).query<R>(sql, params)
    if (rows.length !== 1) throw new Error(`expected exactly 1 row, got ${rows.length}: ${sql.slice(0, 80)}`)
    return rows[0]!
  }

  protected async maybeOne<R extends pg.QueryResultRow>(tx: Tx, sql: string, params: unknown[]): Promise<R | null> {
    const { rows } = await this.client(tx).query<R>(sql, params)
    return rows[0] ?? null
  }

  protected async many<R extends pg.QueryResultRow>(tx: Tx, sql: string, params: unknown[]): Promise<R[]> {
    const { rows } = await this.client(tx).query<R>(sql, params)
    return rows
  }

  protected async count(tx: Tx, sql: string, params: unknown[]): Promise<number> {
    const { rows } = await this.client(tx).query<{ count: string }>(sql, params)
    return Number(rows[0]?.count ?? 0)
  }
}
