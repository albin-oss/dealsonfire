/**
 * Postgres plumbing: pool factory + transactional UnitOfWork (moved from merchant
 * infrastructure in Batch 1 — behavior byte-identical). `Tx` resolves to a pg.PoolClient
 * here and only here.
 */
import pg from 'pg'
import type { Tx, UnitOfWork } from './types'

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 })
}

export function asClient(tx: Tx): pg.PoolClient {
  return tx as pg.PoolClient
}

export class PgUnitOfWork implements UnitOfWork {
  constructor(private readonly pool: pg.Pool) {}

  async withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn(client)
      // Result-shaped business failures also roll back: a command that returns an error
      // must leave no partial writes (commands return Result, they don't throw).
      if (isErrResult(result)) {
        await client.query('ROLLBACK')
      } else {
        await client.query('COMMIT')
      }
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }
}

function isErrResult(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false
}
