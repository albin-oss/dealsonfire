/**
 * Session store (WP-R1-B1). Operational table; the token is stored HASHED (sha-256) —
 * the plaintext exists only in the cookie. Rolling 30d / absolute 90d expiry (AC-3.2).
 */
import type { Tx } from '../../../platform/types'
import { asClient } from '../../../platform/db'

export interface SessionRecord {
  id: string
  userId: string
  stepUpAt: Date | null
  rollingExpiresAt: Date
  absoluteExpiresAt: Date
  revokedAt: Date | null
}

interface Row {
  id: string
  user_id: string
  step_up_at: Date | null
  rolling_expires_at: Date
  absolute_expires_at: Date
  revoked_at: Date | null
}

const toRecord = (r: Row): SessionRecord => ({
  id: r.id, userId: r.user_id, stepUpAt: r.step_up_at,
  rollingExpiresAt: r.rolling_expires_at, absoluteExpiresAt: r.absolute_expires_at, revokedAt: r.revoked_at,
})

export class PgSessionStore {
  async create(tx: Tx, s: {
    id: string; userId: string; tokenHash: string; stepUp: boolean
    rollingExpiresAt: Date; absoluteExpiresAt: Date; userAgent: string | null
  }): Promise<void> {
    await asClient(tx).query(
      `INSERT INTO user_sessions (id, user_id, token_hash, step_up_at, rolling_expires_at, absolute_expires_at, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [s.id, s.userId, s.tokenHash, s.stepUp ? new Date() : null, s.rollingExpiresAt, s.absoluteExpiresAt, s.userAgent])
  }

  /** Active session by token hash (not expired, not revoked). */
  async findActiveByTokenHash(tx: Tx, tokenHash: string): Promise<SessionRecord | null> {
    const { rows } = await asClient(tx).query<Row>(
      `SELECT id, user_id, step_up_at, rolling_expires_at, absolute_expires_at, revoked_at
       FROM user_sessions
       WHERE token_hash = $1 AND revoked_at IS NULL
         AND rolling_expires_at > now() AND absolute_expires_at > now()`, [tokenHash])
    return rows[0] ? toRecord(rows[0]) : null
  }

  async touch(tx: Tx, id: string, rollingExpiresAt: Date): Promise<void> {
    await asClient(tx).query(
      `UPDATE user_sessions SET last_seen_at = now(), rolling_expires_at = $2 WHERE id = $1`, [id, rollingExpiresAt])
  }

  async markStepUp(tx: Tx, id: string): Promise<void> {
    await asClient(tx).query(`UPDATE user_sessions SET step_up_at = now() WHERE id = $1`, [id])
  }

  async revoke(tx: Tx, id: string): Promise<void> {
    await asClient(tx).query(`UPDATE user_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [id])
  }

  /** Revoke all of a user's sessions, optionally keeping one (sign-out-everywhere). */
  async revokeAllForUser(tx: Tx, userId: string, keepId: string | null): Promise<number> {
    const { rowCount } = await asClient(tx).query(
      `UPDATE user_sessions SET revoked_at = now()
       WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2)`, [userId, keepId])
    return rowCount ?? 0
  }

  /** Active sessions for the "where am I signed in?" query (US-9 / ListActiveSessions). */
  async listActiveByUser(tx: Tx, userId: string): Promise<ActiveSessionRow[]> {
    const { rows } = await asClient(tx).query<{ id: string; created_at: Date; last_seen_at: Date | null; user_agent: string | null }>(
      `SELECT id, created_at, last_seen_at, user_agent FROM user_sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND rolling_expires_at > now() AND absolute_expires_at > now()
       ORDER BY last_seen_at DESC NULLS LAST, created_at DESC`, [userId])
    return rows.map((r) => ({ id: r.id, createdAt: r.created_at, lastSeenAt: r.last_seen_at, userAgent: r.user_agent }))
  }
}

export interface ActiveSessionRow {
  id: string
  createdAt: Date
  lastSeenAt: Date | null
  userAgent: string | null
}
