/**
 * Idempotency-Key storage — PLATFORM-owned (BLUEPRINT-002 K2: the key is (key, endpoint,
 * actor) with no domain data; one table serves every domain). First request records itself,
 * completed requests store their response for replay, and a same-key-different-body
 * request is rejected (IDEMPOTENCY_CONFLICT). Keys expire after 24h (purged by the
 * outbox dispatch task). In-flight claims older than RECLAIM_AFTER (a crash between
 * commit and complete) are reclaimable so clients are never wedged for 24h (D-17).
 */
import { createHash } from 'node:crypto'
import type pg from 'pg'

const RECLAIM_AFTER = '60 seconds'

export type IdempotencyCheck =
  | { kind: 'fresh' }
  | { kind: 'replay'; status: number; body: unknown }
  | { kind: 'conflict' }
  | { kind: 'in_flight' }

export class PgIdempotencyStore {
  constructor(private readonly pool: pg.Pool) {}

  hash(body: unknown): string {
    return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex')
  }

  /** Atomically claim the key; report replay/conflict states for existing claims. */
  async begin(key: string, endpoint: string, actorKey: string, requestHash: string): Promise<IdempotencyCheck> {
    const { rows } = await this.pool.query<{ request_hash: string; response_status: number | null; response_body: unknown }>(
      `INSERT INTO request_idempotency_keys (idempotency_key, endpoint, actor_key, request_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (idempotency_key, endpoint, actor_key) DO NOTHING
       RETURNING request_hash, response_status, response_body`,
      [key, endpoint, actorKey, requestHash],
    )
    if (rows.length > 0) return { kind: 'fresh' }

    const existing = await this.pool.query<{ request_hash: string; response_status: number | null; response_body: unknown }>(
      `SELECT request_hash, response_status, response_body FROM request_idempotency_keys
       WHERE idempotency_key = $1 AND endpoint = $2 AND actor_key = $3`,
      [key, endpoint, actorKey],
    )
    const row = existing.rows[0]
    if (!row) return { kind: 'fresh' } // raced with a purge; treat as fresh
    if (row.response_status !== null) {
      if (row.request_hash !== requestHash) return { kind: 'conflict' }
      return { kind: 'replay', status: row.response_status, body: row.response_body }
    }
    // In-flight: a crash between commit and complete() must not wedge the client for 24h.
    // Stale claims are reclaimed atomically; a genuine concurrent request stays in_flight.
    const reclaimed = await this.pool.query(
      `UPDATE request_idempotency_keys SET request_hash = $4, created_at = now()
       WHERE idempotency_key = $1 AND endpoint = $2 AND actor_key = $3
         AND response_status IS NULL AND created_at < now() - interval '${RECLAIM_AFTER}'
       RETURNING idempotency_key`,
      [key, endpoint, actorKey, requestHash],
    )
    if (reclaimed.rows.length > 0) return { kind: 'fresh' }
    if (row.request_hash !== requestHash) return { kind: 'conflict' }
    return { kind: 'in_flight' }
  }

  async complete(key: string, endpoint: string, actorKey: string, status: number, body: unknown): Promise<void> {
    await this.pool.query(
      `UPDATE request_idempotency_keys SET response_status = $4, response_body = $5
       WHERE idempotency_key = $1 AND endpoint = $2 AND actor_key = $3`,
      [key, endpoint, actorKey, status, body === undefined ? null : JSON.stringify(body)],
    )
  }

  /** Failed requests release the key so the client can retry. */
  async release(key: string, endpoint: string, actorKey: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM request_idempotency_keys
       WHERE idempotency_key = $1 AND endpoint = $2 AND actor_key = $3 AND response_status IS NULL`,
      [key, endpoint, actorKey],
    )
  }

  async purgeExpired(): Promise<void> {
    await this.pool.query(`DELETE FROM request_idempotency_keys WHERE created_at < now() - interval '24 hours'`)
  }
}
