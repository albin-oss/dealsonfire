/**
 * Email change (C12-3) — THE authoritative state machine for moving the
 * address an account answers to. Treated as an account-takeover surface:
 *
 *   requestChange   — authenticated + step-up-fresh only. The NEW address
 *                     must prove possession (tokened letter); the OLD address
 *                     is notified immediately. A new request SUPERSEDES any
 *                     pending one (the partial unique index makes racing
 *                     requests converge). Enumeration-proof: the requester's
 *                     answer is uniform whether or not the new address is
 *                     claimable — the truth goes to the ADDRESS, not the
 *                     asker.
 *   confirmChange   — consumes the possession token (one-shot, purpose-bound),
 *                     applies the change, opens the OLD address's bounded
 *                     72-hour reversal window (tokened letter), revokes every
 *                     OTHER session, and invalidates outstanding verify
 *                     tokens. The unique-email law is the final guard: a
 *                     taken address converges to the same uniform refusal.
 *   revertChange    — the old address takes the account back within 72h:
 *                     email restored, EVERY session revoked, EVERY
 *                     outstanding token of every purpose invalidated (an
 *                     attacker's password change dies with their sessions),
 *                     letters both ways. After the window: uniform refusal.
 *
 * No controller interprets "pending" — the email_changes row is the only truth.
 */
import type { Tx, UnitOfWork, EventStore, AuditLog } from '../../../platform/types'
import { asClient } from '../../../platform/db'
import { uuidv7 } from '../../../platform/uuid'
import { ok, err, type Result } from '../../../shared/result'
import { domainError, type DomainError } from '../../../shared/errors'
import type { PgRecoveryStore } from '../infrastructure/token-stores'
import type { EmailPort } from '../domain/ports'

const POSSESSION_TTL_MS = 30 * 60 * 1000
const REVERT_WINDOW_MS = 72 * 60 * 60 * 1000

export interface TokenTools { generate(): string; hash(token: string): string }

export class EmailChangeService {
  constructor(private readonly deps: {
    uow: UnitOfWork
    recovery: PgRecoveryStore
    tokens: TokenTools
    email: EmailPort
    audit: AuditLog
    events: EventStore
    revokeSessions: (tx: Tx, userId: string, keepSessionId: string | null) => Promise<number>
  }) {}

  /** Uniform answer by design: the requester learns nothing about the new address. */
  async requestChange(input: { userId: string; sessionId: string | null; newEmail: string; stepUpVerified: boolean }):
    Promise<Result<{ requested: true }, DomainError>> {
    if (!input.stepUpVerified) {
      return err(domainError('STEP_UP_REQUIRED', 'confirm it is you before changing where your account lives'))
    }
    const newEmail = input.newEmail.trim()
    return this.deps.uow.withTransaction(async (tx) => {
      const client = asClient(tx)
      const { rows: me } = await client.query<{ email: string }>(
        `SELECT email FROM users WHERE id = $1 FOR UPDATE`, [input.userId])
      if (!me[0]) return err(domainError('NOT_FOUND', 'account not found'))
      const oldEmail = me[0].email
      if (oldEmail.toLowerCase() === newEmail.toLowerCase()) {
        return err(domainError('VALIDATION_FAILED', 'that is already your email'))
      }
      // a new request supersedes the previous one — requests never race
      await client.query(
        `UPDATE email_changes SET state = 'superseded', resolved_at = now() WHERE user_id = $1 AND state = 'pending'`,
        [input.userId])
      // enumeration-proof: whether the address is claimable decides which LETTER
      // the address receives — the requester's answer never varies
      const { rows: taken } = await client.query(
        `SELECT 1 FROM users WHERE email = $1 AND status = 'active' LIMIT 1`, [newEmail])
      if (!taken[0]) {
        await client.query(
          `INSERT INTO email_changes (id, user_id, old_email, new_email) VALUES ($1, $2, $3, $4)`,
          [uuidv7(), input.userId, oldEmail, newEmail])
        const token = this.deps.tokens.generate()
        await this.deps.recovery.invalidateOutstanding(tx, input.userId, 'email_change_new')
        await this.deps.recovery.create(tx, {
          id: uuidv7(), userId: input.userId, tokenHash: this.deps.tokens.hash(token),
          purpose: 'email_change_new', expiresAt: new Date(Date.now() + POSSESSION_TTL_MS),
        })
        await this.deps.email.send(tx, { to: newEmail, template: 'email_change_confirm', vars: { token } })
      } else {
        // the address's owner hears the truth; the requester cannot observe it
        await this.deps.email.send(tx, { to: newEmail, template: 'email_change_already_yours', vars: {} })
      }
      await this.deps.email.send(tx, { to: oldEmail, template: 'email_change_notice', vars: { new_hint: maskEmail(newEmail) } })
      await this.deps.audit.record(tx, {
        businessId: null, actor: { type: 'user', id: input.userId }, command: 'identity.email.change_requested',
        sensitivity: 'sensitive', target: { type: 'user', id: input.userId },
        afterDigest: { new_email_hint: maskEmail(newEmail) },
      })
      return ok({ requested: true as const })
    })
  }

  async confirmChange(token: string): Promise<Result<{ changed: true }, DomainError>> {
    const tokenHash = this.deps.tokens.hash(token)
    const invalid = () => err(domainError('INVALID_TOKEN', 'that link is no longer valid — request the change again from your account'))
    return this.deps.uow.withTransaction(async (tx): Promise<Result<{ changed: true }, DomainError>> => {
      const client = asClient(tx)
      const userId = await this.deps.recovery.consume(tx, tokenHash, 'email_change_new')
      if (!userId) return invalid()
      const { rows: pending } = await client.query<{ id: string; old_email: string; new_email: string }>(
        `SELECT id, old_email, new_email FROM email_changes WHERE user_id = $1 AND state = 'pending' FOR UPDATE`, [userId])
      if (!pending[0]) return invalid()
      const change = pending[0]
      try {
        await client.query(`UPDATE users SET email = $2, updated_at = now() WHERE id = $1`, [userId, change.new_email])
      } catch {
        // the unique-email law fired: someone claimed the address since the
        // request — the attempt resolves, the answer stays uniform
        await client.query(`UPDATE email_changes SET state = 'superseded', resolved_at = now() WHERE id = $1`, [change.id])
        return invalid()
      }
      await client.query(
        `UPDATE email_changes SET state = 'completed', completed_at = now(),
                revert_expires_at = now() + ($2 || ' milliseconds')::interval
         WHERE id = $1`, [change.id, REVERT_WINDOW_MS])
      // the old address holds the bounded way back
      const revertToken = this.deps.tokens.generate()
      await this.deps.recovery.invalidateOutstanding(tx, userId, 'email_change_revert')
      await this.deps.recovery.create(tx, {
        id: uuidv7(), userId, tokenHash: this.deps.tokens.hash(revertToken),
        purpose: 'email_change_revert', expiresAt: new Date(Date.now() + REVERT_WINDOW_MS),
      })
      // stale verify tokens aimed at the old address die; other sessions die
      await this.deps.recovery.invalidateOutstanding(tx, userId, 'email_verify')
      await this.deps.revokeSessions(tx, userId, null)
      await this.deps.email.send(tx, { to: change.old_email, template: 'email_change_revert', vars: { token: revertToken, new_hint: maskEmail(change.new_email) } })
      await this.deps.audit.record(tx, {
        businessId: null, actor: { type: 'user', id: userId }, command: 'identity.email.change_completed',
        sensitivity: 'sensitive', target: { type: 'user', id: userId },
        afterDigest: { new_email_hint: maskEmail(change.new_email), revert_window_hours: 72 },
      })
      return ok({ changed: true as const })
    })
  }

  async revertChange(token: string): Promise<Result<{ reverted: true }, DomainError>> {
    const tokenHash = this.deps.tokens.hash(token)
    const invalid = () => err(domainError('INVALID_TOKEN', 'that link is no longer valid'))
    return this.deps.uow.withTransaction(async (tx): Promise<Result<{ reverted: true }, DomainError>> => {
      const client = asClient(tx)
      const userId = await this.deps.recovery.consume(tx, tokenHash, 'email_change_revert')
      if (!userId) return invalid()
      const { rows } = await client.query<{ id: string; old_email: string; new_email: string }>(
        `SELECT id, old_email, new_email FROM email_changes
         WHERE user_id = $1 AND state = 'completed' AND revert_expires_at > now()
         ORDER BY completed_at DESC LIMIT 1 FOR UPDATE`, [userId])
      if (!rows[0]) return invalid()
      const change = rows[0]
      try {
        await client.query(`UPDATE users SET email = $2, updated_at = now() WHERE id = $1`, [userId, change.old_email])
      } catch {
        // the old address was re-registered meanwhile — a contested account is
        // a human's decision, loudly, never a silent overwrite
        return err(domainError('CONFLICT', 'this account needs a human — write to support and we will sort it out together'))
      }
      await client.query(`UPDATE email_changes SET state = 'reverted', resolved_at = now() WHERE id = $1`, [change.id])
      // full lockdown: every session dies (including any attacker's), every
      // outstanding token of every purpose dies (including a password reset
      // the new-address holder may have minted)
      await this.deps.revokeSessions(tx, userId, null)
      for (const purpose of ['password_reset', 'email_verify', 'email_change_new'] as const) {
        await this.deps.recovery.invalidateOutstanding(tx, userId, purpose)
      }
      await this.deps.email.send(tx, { to: change.old_email, template: 'email_change_reverted', vars: {} })
      await this.deps.audit.record(tx, {
        businessId: null, actor: { type: 'user', id: userId }, command: 'identity.email.change_reverted',
        sensitivity: 'sensitive', target: { type: 'user', id: userId }, afterDigest: {},
      })
      return ok({ reverted: true as const })
    })
  }
}

/** rosa@example.com → r···@example.com — enough to recognize, never to learn. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '···'
  return `${local[0]}···@${domain}`
}
