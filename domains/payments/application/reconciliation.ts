/**
 * External reconciliation (C10 Slice 4 — RM-H1): "does Stripe agree with our
 * books?" answered daily, as a query, never a shrug.
 *
 *   watermark → provider balance transactions (boundary read, no tx) →
 *   each lands as ONE reconciliation_item, replay-idempotent by the provider's
 *   transaction id → matched against payment facts by intent ref + amount →
 *   unmatched rows persist, alarm, and feed /ops/alarms until a human explains
 *   them. NO silent ledger adjustment — this module only OBSERVES drift.
 *
 * Interrupted runs recover: a 'running' row older than an hour is marked failed
 * and the next run re-covers its ground (items are idempotent, nothing doubles).
 */
import type { Tx } from '../../../platform/types'
import { asClient, assertOutsideTransaction } from '../../../platform/db'
import { uuidv7 } from '../../../platform/uuid'
import type { ProviderPort, ProviderBalanceTxn } from './payments'

const RUN_STALE_MINUTES = 60
const BATCH = 100

export class ReconciliationService {
  constructor(private readonly deps: {
    runTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>
    provider: ProviderPort
    alarm: (message: string) => void
  }) {}

  /** Cron lane: runs when due (daily), or always when `force` (tests, operators). */
  async maybeRun(force = false): Promise<{ ran: boolean; matched: number; unmatched: number }> {
    assertOutsideTransaction('reconciliation.maybeRun')
    const due = await this.deps.runTx(async (tx) => {
      const client = asClient(tx)
      // recover: a run stuck 'running' past staleness is FAILED, loudly, never silently
      const { rows: stuck } = await client.query<{ id: string }>(
        `UPDATE reconciliation_runs SET state = 'failed', finished_at = now()
         WHERE state = 'running' AND started_at < now() - ($1 || ' minutes')::interval RETURNING id`,
        [RUN_STALE_MINUTES])
      for (const s of stuck) this.deps.alarm(`[payments] reconciliation run ${s.id} was interrupted — marked failed; this run re-covers its ground`)
      const { rows } = await client.query<{ watermark: string | null; running: boolean }>(
        `SELECT (SELECT max(watermark)::text FROM reconciliation_runs WHERE state = 'complete') AS watermark,
                EXISTS (SELECT 1 FROM reconciliation_runs WHERE state = 'running') AS running`)
      return { lastWatermark: rows[0]?.watermark ?? null, running: rows[0]?.running ?? false }
    })
    if (due.running) return { ran: false, matched: 0, unmatched: 0 }
    const last = due.lastWatermark ? new Date(due.lastWatermark) : new Date(0)
    if (!force && Date.now() - last.getTime() < 24 * 3600_000) return { ran: false, matched: 0, unmatched: 0 }

    // phase 2: the provider's account of itself (outside any transaction)
    const txns = await this.deps.provider.listBalanceTransactions(last.toISOString(), BATCH)

    const runId = uuidv7()
    const counts = await this.deps.runTx(async (tx) => {
      const client = asClient(tx)
      await client.query(`INSERT INTO reconciliation_runs (id, watermark) VALUES ($1, $2)`, [runId, last.toISOString()])
      let matched = 0
      let unmatched = 0
      let maxSeen = last.toISOString()
      for (const txn of txns) {
        if (txn.occurredAt > maxSeen) maxSeen = txn.occurredAt
        const verdict = await this.match(tx, txn)
        const inserted = await client.query(
          `INSERT INTO reconciliation_items (id, run_id, provider_txn_id, kind, amount_minor, currency, occurred_at, matched_intent_id, state, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (provider_txn_id) DO NOTHING RETURNING id`,
          [uuidv7(), runId, txn.id, txn.kind, txn.amountMinor, txn.currency, txn.occurredAt,
           verdict.intentId, verdict.state, verdict.note])
        if (inserted.rowCount === 0) continue // replay: this ground was covered
        if (verdict.state === 'unmatched') unmatched += 1
        else matched += 1
      }
      await client.query(
        `UPDATE reconciliation_runs SET state = 'complete', matched = $2, unmatched = $3, watermark = $4, finished_at = now() WHERE id = $1`,
        [runId, matched, unmatched, maxSeen])
      return { matched, unmatched }
    })
    if (counts.unmatched > 0) {
      this.deps.alarm(`[payments] RECONCILIATION found ${counts.unmatched} unmatched provider transaction(s) — Stripe and the ledger disagree; runbook: docs/runbooks/reconciliation.md; NEVER adjust the ledger silently`)
    }
    return { ran: true, ...counts }
  }

  /** Match one provider movement against our facts. Payouts/fees are provider-
   *  side mechanics with no per-order fact — matched by category, not identity. */
  private async match(tx: Tx, txn: ProviderBalanceTxn):
    Promise<{ state: 'matched' | 'unmatched'; intentId: string | null; note: string | null }> {
    const client = asClient(tx)
    if (txn.kind === 'payout' || txn.kind === 'fee') {
      return { state: 'matched', intentId: null, note: `${txn.kind}: provider-side mechanics` }
    }
    if ((txn.kind === 'charge' || txn.kind === 'refund') && txn.sourceRef) {
      const factKind = txn.kind === 'charge' ? 'captured' : 'refunded'
      const expectAmount = Math.abs(txn.amountMinor)
      const { rows } = await client.query<{ intent_id: string }>(
        `SELECT f.intent_id FROM payment_facts f
         JOIN payment_intents i ON i.id = f.intent_id
         WHERE i.provider_ref = $1 AND f.kind = $2 AND f.amount_minor = $3
         LIMIT 1`, [txn.sourceRef, factKind, expectAmount])
      if (rows[0]) return { state: 'matched', intentId: rows[0].intent_id, note: null }
      return { state: 'unmatched', intentId: null, note: `no ${factKind} fact for ${txn.sourceRef} at ${expectAmount}` }
    }
    return { state: 'unmatched', intentId: null, note: 'no matching rule for this movement' }
  }
}
