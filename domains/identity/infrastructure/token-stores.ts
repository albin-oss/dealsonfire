/**
 * Recovery, guest-token, claim, and passkey stores (WP-R1-B1). Operational tables;
 * all tokens hashed at rest. Grouped: each is a thin data-access class.
 */
import type { Tx } from '../../../platform/types'
import { asClient } from '../../../platform/db'

export class PgRecoveryStore {
  async create(tx: Tx, r: { id: string; userId: string; tokenHash: string; purpose: 'password_reset' | 'email_verify'; expiresAt: Date }): Promise<void> {
    await asClient(tx).query(
      `INSERT INTO user_recovery_tokens (id, user_id, token_hash, purpose, expires_at) VALUES ($1, $2, $3, $4, $5)`,
      [r.id, r.userId, r.tokenHash, r.purpose, r.expiresAt])
  }

  /** Consume atomically: single-use is enforced by the UPDATE ... WHERE consumed_at IS NULL guard. */
  async consume(tx: Tx, tokenHash: string, purpose: 'password_reset' | 'email_verify'): Promise<string | null> {
    const { rows } = await asClient(tx).query<{ user_id: string }>(
      `UPDATE user_recovery_tokens SET consumed_at = now()
       WHERE token_hash = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
       RETURNING user_id`, [tokenHash, purpose])
    return rows[0]?.user_id ?? null
  }

  /** Invalidate a user's other outstanding tokens of a purpose (issued anew / after reset). */
  async invalidateOutstanding(tx: Tx, userId: string, purpose: 'password_reset' | 'email_verify'): Promise<void> {
    await asClient(tx).query(
      `UPDATE user_recovery_tokens SET consumed_at = now()
       WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`, [userId, purpose])
  }
}

export class PgGuestTokenStore {
  async create(tx: Tx, g: { id: string; tokenHash: string; scopeType: string; scopeRef: string; expiresAt: Date }): Promise<void> {
    await asClient(tx).query(
      `INSERT INTO guest_tokens (id, token_hash, scope_type, scope_ref, expires_at) VALUES ($1, $2, $3, $4, $5)`,
      [g.id, g.tokenHash, g.scopeType, g.scopeRef, g.expiresAt])
  }

  /** Constant-time-ish lookup by hash; returns scope only when valid. */
  async resolve(tx: Tx, tokenHash: string): Promise<{ scopeType: string; scopeRef: string } | null> {
    const { rows } = await asClient(tx).query<{ scope_type: string; scope_ref: string }>(
      `SELECT scope_type, scope_ref FROM guest_tokens WHERE token_hash = $1 AND expires_at > now()`, [tokenHash])
    return rows[0] ? { scopeType: rows[0].scope_type, scopeRef: rows[0].scope_ref } : null
  }
}

export class PgClaimStore {
  /** Idempotent: an artifact is claimed by exactly one user, once (unique constraint). */
  async claim(tx: Tx, c: { id: string; userId: string; claimType: string; claimRef: string }): Promise<'claimed' | 'already'> {
    const { rowCount } = await asClient(tx).query(
      `INSERT INTO identity_claims (id, user_id, claim_type, claim_ref) VALUES ($1, $2, $3, $4)
       ON CONFLICT (claim_type, claim_ref) DO NOTHING`,
      [c.id, c.userId, c.claimType, c.claimRef])
    return rowCount === 1 ? 'claimed' : 'already'
  }

  /** Who holds this artifact (null = unclaimed). */
  async owner(tx: Tx, claimType: string, claimRef: string): Promise<string | null> {
    const { rows } = await asClient(tx).query<{ user_id: string }>(
      `SELECT user_id FROM identity_claims WHERE claim_type = $1 AND claim_ref = $2`, [claimType, claimRef])
    return rows[0]?.user_id ?? null
  }

  /** The user's newest claim of a type (the visitor-corner restore path). */
  async findByUser(tx: Tx, userId: string, claimType: string): Promise<string | null> {
    const { rows } = await asClient(tx).query<{ claim_ref: string }>(
      `SELECT claim_ref FROM identity_claims WHERE user_id = $1 AND claim_type = $2
       ORDER BY created_at DESC LIMIT 1`, [userId, claimType])
    return rows[0]?.claim_ref ?? null
  }
}

export interface PasskeyRecord {
  id: string
  userId: string
  credentialId: string
  publicKey: Buffer
  counter: number
  transports: string[]
}

export class PgPasskeyStore {
  async create(tx: Tx, p: PasskeyRecord & { label: string | null }): Promise<void> {
    await asClient(tx).query(
      `INSERT INTO user_passkeys (id, user_id, credential_id, public_key, counter, transports, label)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [p.id, p.userId, p.credentialId, p.publicKey, p.counter, p.transports, p.label])
  }

  async findByCredentialId(tx: Tx, credentialId: string): Promise<PasskeyRecord | null> {
    const { rows } = await asClient(tx).query<{ id: string; user_id: string; credential_id: string; public_key: Buffer; counter: string; transports: string[] }>(
      `SELECT id, user_id, credential_id, public_key, counter, transports FROM user_passkeys WHERE credential_id = $1`, [credentialId])
    const r = rows[0]
    return r ? { id: r.id, userId: r.user_id, credentialId: r.credential_id, publicKey: r.public_key, counter: Number(r.counter), transports: r.transports } : null
  }

  async listByUser(tx: Tx, userId: string): Promise<PasskeyRecord[]> {
    const { rows } = await asClient(tx).query<{ id: string; user_id: string; credential_id: string; public_key: Buffer; counter: string; transports: string[] }>(
      `SELECT id, user_id, credential_id, public_key, counter, transports FROM user_passkeys WHERE user_id = $1`, [userId])
    return rows.map((r) => ({ id: r.id, userId: r.user_id, credentialId: r.credential_id, publicKey: r.public_key, counter: Number(r.counter), transports: r.transports }))
  }

  async updateCounter(tx: Tx, credentialId: string, counter: number): Promise<void> {
    await asClient(tx).query(`UPDATE user_passkeys SET counter = $2, last_used_at = now() WHERE credential_id = $1`, [credentialId, counter])
  }
}
