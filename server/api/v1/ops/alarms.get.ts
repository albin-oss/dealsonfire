/**
 * GET /api/v1/ops/alarms (C9) — the review queue, derived from STATE (never a
 * parallel alarm store that can drift):
 *   payment_stuck  — payment_pending > 2h (heading for the 24h honest failure)
 *   stock_orphaned — payment_failed with committed reservations (PRR-H1)
 *   promise_broken — keystone aging at stage 2+ (refund due or retrying)
 *   hold_stuck     — fulfillment evidence 10+ days old, hold never released
 *                    (RM-H3: the one alarm that previously lived only in stdout)
 *   dispute_open   — a chargeback with a deadline (C10 slice 4)
 *   risk_paused    — a till paused by the exposure limits; HUMAN review resumes
 *   recon_unmatched — Stripe and the ledger disagree (never adjusted silently)
 *   negative_payable — refunds outran the merchant's balance (RM-H5)
 * Acknowledged = an operator wrote an ack note on the order; the alarm stays
 * listed (state is still true) but carries the human's initials.
 */
import { defineQueryEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import { sendProblem } from '../../../utils/problem'
import { isOperator } from '../../../utils/ops'
import { domainError } from '@shared/errors'

export default defineQueryEndpoint({
  async handler({ event, auth }) {
    if (!isOperator(auth.userId)) return sendProblem(event, domainError('NOT_FOUND', 'not found'))
    const c = getContainer()
    const [stuck, orphaned, broken, holds, disputes, riskPaused, unmatched, negativePayable, acks] = await Promise.all([
      c.pool.query(
        `SELECT id, order_number, state, placed_at FROM orders
          WHERE state = 'payment_pending' AND placed_at < now() - interval '2 hours'
          ORDER BY placed_at LIMIT 100`),
      c.pool.query(
        `SELECT o.id, o.order_number, o.state, o.placed_at FROM orders o
          WHERE o.state = 'payment_failed'
            AND EXISTS (SELECT 1 FROM order_lines l JOIN reservations r ON r.id = l.reservation_id
                         WHERE l.order_id = o.id AND r.status = 'committed')
          ORDER BY o.placed_at LIMIT 100`),
      c.pool.query(
        `SELECT id, order_number, state, aging_stage, promise_ship_by, placed_at FROM orders
          WHERE aging_stage >= 2 AND state NOT IN ('refunded','cancelled')
          ORDER BY promise_ship_by LIMIT 100`),
      c.pool.query(
        `SELECT o.id, o.order_number, o.state, o.placed_at FROM orders o
          WHERE o.hold_released_at IS NULL
            AND o.state IN ('fulfilled','completed')
            AND EXISTS (SELECT 1 FROM fulfillment_cases f WHERE f.order_id = o.id
                          AND COALESCE(f.handed_over_at, f.dispatched_at) < now() - interval '10 days')
          ORDER BY o.placed_at LIMIT 100`),
      c.pool.query(
        `SELECT d.order_id AS id, d.provider_dispute_id AS order_number, d.state, d.evidence_due_at AS placed_at
          FROM payment_disputes d WHERE d.state = 'open' ORDER BY d.evidence_due_at NULLS LAST LIMIT 100`),
      c.pool.query(
        `SELECT p.business_id AS id, p.risk_pause_reason AS order_number, 'risk_paused' AS state, p.risk_paused_at AS placed_at
          FROM merchant_payment_profiles p WHERE p.risk_paused_at IS NOT NULL ORDER BY p.risk_paused_at LIMIT 100`),
      c.pool.query(
        `SELECT r.id, r.provider_txn_id AS order_number, r.state, r.created_at AS placed_at
          FROM reconciliation_items r WHERE r.state = 'unmatched' ORDER BY r.created_at LIMIT 100`),
      c.pool.query(
        `SELECT a.business_id AS id, a.balance_minor::text AS order_number, 'negative' AS state, now() AS placed_at
          FROM ledger_accounts a WHERE a.kind = 'merchant_payable' AND a.balance_minor < 0 LIMIT 100`),
      c.pool.query(
        `SELECT DISTINCT order_id FROM order_timeline
          WHERE entry_type = 'note' AND (message->>'ack')::boolean IS TRUE`),
    ])
    const acked = new Set(acks.rows.map((r: { order_id: string }) => r.order_id))
    const shape = (kind: string, rows: Array<{ id: string }>) =>
      rows.map((r) => ({ kind, ...r, acknowledged: acked.has(r.id) }))
    return {
      alarms: [
        ...shape('payment_stuck', stuck.rows),
        ...shape('stock_orphaned', orphaned.rows),
        ...shape('promise_broken', broken.rows),
        ...shape('hold_stuck', holds.rows),
        ...shape('dispute_open', disputes.rows),
        ...shape('risk_paused', riskPaused.rows),
        ...shape('recon_unmatched', unmatched.rows),
        ...shape('negative_payable', negativePayable.rows),
      ],
    }
  },
})
