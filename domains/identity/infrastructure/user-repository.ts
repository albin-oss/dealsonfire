/** PgUserRepository (WP-R1-B1). Kernel idioms: rehydration guard, sequence guard. */
import type { Tx } from '../../../platform/types'
import { asClient } from '../../../platform/db'
import { InfrastructureError } from '../../../shared/errors'
import { asUserId, type UserId } from '../shared-kernel/ids'
import type { UserRepository } from '../domain/ports'
import { User } from '../domain/user'

interface Row {
  id: string
  email: string
  email_verified: boolean
  display_name: string | null
  status: string
  sequence: string
}

const COLUMNS = 'id, email, email_verified, display_name, status, sequence'

function rehydrate(row: Row): User {
  if (row.status !== 'active' && row.status !== 'deactivated') {
    throw new InfrastructureError(`corrupt users row ${row.id}: status=${row.status}`, { retryable: false })
  }
  return User.rehydrate({
    id: asUserId(row.id),
    email: row.email,
    emailVerified: row.email_verified,
    displayName: row.display_name,
    status: row.status,
    sequence: Number(row.sequence),
  })
}

export class PgUserRepository implements UserRepository {
  async insert(tx: Tx, user: User, passwordHash: string | null): Promise<void> {
    await asClient(tx).query(
      `INSERT INTO users (id, email, email_verified, display_name, status, sequence)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, user.email, user.emailVerified, user.displayName, user.status, user.sequence],
    )
    if (passwordHash !== null) {
      await asClient(tx).query(
        `INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`,
        [user.id, passwordHash],
      )
    }
  }

  async findById(tx: Tx, id: UserId, opts?: { forUpdate?: boolean }): Promise<User | null> {
    const { rows } = await asClient(tx).query<Row>(
      `SELECT ${COLUMNS} FROM users WHERE id = $1${opts?.forUpdate ? ' FOR UPDATE' : ''}`, [id])
    return rows[0] ? rehydrate(rows[0]) : null
  }

  async findActiveByEmail(tx: Tx, email: string): Promise<User | null> {
    const { rows } = await asClient(tx).query<Row>(
      `SELECT ${COLUMNS} FROM users WHERE email = $1 AND status = 'active'`, [email])
    return rows[0] ? rehydrate(rows[0]) : null
  }

  async update(tx: Tx, user: User): Promise<void> {
    const { rowCount } = await asClient(tx).query(
      `UPDATE users SET email_verified = $2, display_name = $3, status = $4, sequence = $5, updated_at = now()
       WHERE id = $1 AND sequence = $5 - 1`,
      [user.id, user.emailVerified, user.displayName, user.status, user.sequence])
    if (rowCount !== 1) throw new InfrastructureError(`user ${user.id}: concurrent modification`, { retryable: true })
  }

  async getPasswordHash(tx: Tx, id: UserId): Promise<string | null> {
    const { rows } = await asClient(tx).query<{ password_hash: string }>(
      `SELECT password_hash FROM user_credentials WHERE user_id = $1`, [id])
    return rows[0]?.password_hash ?? null
  }

  async setPasswordHash(tx: Tx, id: UserId, hash: string): Promise<void> {
    await asClient(tx).query(
      `INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET password_hash = $2, updated_at = now()`,
      [id, hash])
  }
}
