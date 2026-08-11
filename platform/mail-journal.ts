/**
 * The mail journal (C12-1 "The Letters Arrive") — §7 for letters.
 *
 * Shape (UPDATED_PAYMENT_LIFECYCLE §7, applied to mail exactly as the PE
 * review directed):
 *   phase 1 — the consumer COMPOSES and JOURNALS the letter inside its
 *             transaction (one row per logical letter; the journal's unique
 *             key IS exactly-once composition);
 *   phase 2 — the driver speaks to the provider OUTSIDE any transaction,
 *             under a stable idempotency key derived from the letter's
 *             identity (consumer + dedup ref + recipient);
 *   phase 3 — the outcome settles on the journal row (sent / suppressed /
 *             failed), never silently.
 *
 * Suppression is DERIVED at send time from mail_bounces (permanent outcomes
 * only) and never applies to critical letters — those send regardless and
 * alarm when they bounce.
 */
import { createHash } from 'node:crypto'
import type pg from 'pg'
import type { Tx } from './types'
import { asClient, assertOutsideTransaction } from './db'
import { uuidv7 } from './uuid'
import { RetryableMailError, type MailPort } from './mail'

export interface LetterInput {
  consumer: string
  /** The letter's provenance: the domain event id (notification letters) or
   *  the recovery-token id (identity letters). With consumer+recipient it IS
   *  the logical letter's identity. */
  dedupRef: string
  to: string
  subject: string
  body: string
  critical?: boolean
}

/** Phase 1: journal one logical letter. Replay-safe: the unique key answers
 *  a second composition with silence. */
export async function journalLetter(tx: Tx, letter: LetterInput): Promise<void> {
  await asClient(tx).query(
    `INSERT INTO mail_journal (id, consumer, dedup_ref, recipient, subject, body, critical)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (consumer, dedup_ref, recipient) DO NOTHING`,
    [uuidv7(), letter.consumer, letter.dedupRef, letter.to, letter.subject, letter.body, letter.critical ?? false])
}

const MAX_ATTEMPTS = 8
const RETENTION_MONTHS = 12

interface JournalRow {
  id: string
  consumer: string
  dedup_ref: string
  recipient: string
  subject: string
  body: string
  critical: boolean
  attempts: number
}

export class MailJournalDriver {
  constructor(private readonly deps: {
    pool: pg.Pool
    mail: MailPort
    alarm: (message: string) => void
  }) {}

  /** The stable provider idempotency identity (C12-1 binding: derived from
   *  consumer + event/dedup identity; the recipient hash distinguishes the
   *  two letters one event legitimately produces). */
  static idempotencyKey(row: Pick<JournalRow, 'consumer' | 'dedup_ref' | 'recipient'>): string {
    const recipientHash = createHash('sha256').update(row.recipient.toLowerCase()).digest('hex').slice(0, 16)
    return `mail:${row.consumer}:${row.dedup_ref}:${recipientHash}`
  }

  /**
   * Phases 2+3 for every due pending letter. Safe to call concurrently
   * (SKIP LOCKED claim; attempts bump in the claim itself) and safe to call
   * often (a no-op when nothing is due). Backoff: immediate first attempt,
   * then 2^attempts seconds capped at 5 minutes.
   */
  async drivePending(limit = 25): Promise<{ sent: number; suppressed: number; failed: number; retried: number }> {
    assertOutsideTransaction('mailJournal.drivePending')
    const { rows } = await this.deps.pool.query<JournalRow>(
      `UPDATE mail_journal SET attempts = attempts + 1, updated_at = now()
       WHERE id IN (
         SELECT id FROM mail_journal
          WHERE state = 'pending'
            AND updated_at <= now() - make_interval(secs =>
                  CASE WHEN attempts = 0 THEN 0 ELSE LEAST(2 ^ attempts, 300) END)
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1)
       RETURNING id, consumer, dedup_ref, recipient, subject, body, critical, attempts`,
      [limit])

    let sent = 0; let suppressed = 0; let failed = 0; let retried = 0
    for (const row of rows) {
      // derived suppression — non-critical letters to a permanently-bounced
      // address are not sent; the decision is recorded, never silent
      if (!row.critical) {
        const { rows: bounced } = await this.deps.pool.query(
          `SELECT 1 FROM mail_bounces WHERE recipient = $1 AND permanent LIMIT 1`, [row.recipient])
        if (bounced[0]) {
          await this.deps.pool.query(
            `UPDATE mail_journal SET state = 'suppressed', last_error = 'recipient permanently bounced — derived suppression', updated_at = now()
             WHERE id = $1 AND state = 'pending'`, [row.id])
          suppressed += 1
          continue
        }
      }
      try {
        const { providerRef } = await this.deps.mail.send({
          to: row.recipient, subject: row.subject, body: row.body,
          idempotencyKey: MailJournalDriver.idempotencyKey(row),
        })
        await this.deps.pool.query(
          `UPDATE mail_journal SET state = 'sent', provider_ref = $2, sent_at = now(), last_error = NULL, updated_at = now()
           WHERE id = $1 AND state = 'pending'`, [row.id, providerRef])
        sent += 1
      } catch (error) {
        const retryable = error instanceof RetryableMailError && row.attempts < MAX_ATTEMPTS
        const detail = (error as Error).message.slice(0, 500)
        if (retryable) {
          await this.deps.pool.query(
            `UPDATE mail_journal SET last_error = $2, updated_at = now() WHERE id = $1`, [row.id, detail])
          retried += 1
        } else {
          await this.deps.pool.query(
            `UPDATE mail_journal SET state = 'failed', last_error = $2, updated_at = now() WHERE id = $1`, [row.id, detail])
          failed += 1
          this.deps.alarm(`[mail] letter ${row.consumer} to ${row.recipient} FAILED permanently: ${detail} — the letter did not go out; runbook: docs/runbooks/mail.md`)
        }
      }
    }

    // opportunistic retention (manifest: operational exhaust, 12 months)
    await this.deps.pool.query(
      `DELETE FROM mail_journal WHERE state <> 'pending' AND created_at < now() - interval '${RETENTION_MONTHS} months'`)
    return { sent, suppressed, failed, retried }
  }

  /** Webhook intake: one bounce/complaint fact, exactly once per provider
   *  event (replays answer with silence). Critical-letter bounces alarm. */
  async recordBounce(fact: {
    providerEventId: string
    providerRef: string | null
    recipient: string
    kind: 'bounce' | 'complaint'
    permanent: boolean
    occurredAt: string
  }): Promise<{ recorded: boolean }> {
    const { rowCount } = await this.deps.pool.query(
      `INSERT INTO mail_bounces (id, provider_event_id, provider_ref, recipient, kind, permanent, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (provider_event_id) DO NOTHING`,
      [uuidv7(), fact.providerEventId, fact.providerRef, fact.recipient, fact.kind, fact.permanent, fact.occurredAt])
    if (rowCount === 0) return { recorded: false } // webhook replay — already truth
    if (fact.providerRef) {
      const { rows } = await this.deps.pool.query<{ consumer: string }>(
        `SELECT consumer FROM mail_journal WHERE provider_ref = $1 AND critical LIMIT 1`, [fact.providerRef])
      if (rows[0]) {
        this.deps.alarm(`[mail] a CRITICAL letter (${rows[0].consumer}) ${fact.kind === 'complaint' ? 'drew a complaint' : 'bounced'} at ${fact.recipient} — the person may not have received it; runbook: docs/runbooks/mail.md`)
      }
    }
    return { recorded: true }
  }
}
