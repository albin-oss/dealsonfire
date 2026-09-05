/**
 * Returns (Commerce Foundation C9 — ADR-006 returns module; CDC-001 §2.3).
 * The ReturnCase lifecycle with ONE decision point:
 *
 *   requested  → the buyer's ask (eligible fulfilled lines, inside the window)
 *   authorized → the maker says yes + their instructions (or refunds WITHOUT
 *                requiring the send-back — generosity is one tap, RT1)
 *   resolved   → received + inspected + disposed + refunded, ONE action
 *                (the resolution IS the decision — never duplicate approvals)
 *   declined   → said plainly, with the reason
 *
 * Money and order-line reactions are orchestrated by the composition root
 * (refund via the ONE payments primitive; restock via the reason-coded stock
 * entry) — this repository owns the case truth and the operations.return.*
 * facts (CDC-001 choreography, emitted through the operations quartet).
 */
import { uuidv7 } from '../../../../platform/uuid'
import type { Tx, EventStore } from '../../../../platform/types'
import { asClient } from '../../../../platform/db'

export const RETURN_WINDOW_DAYS = 30

export interface ReturnCaseView {
  id: string; order_id: string; state: string; reason_code: string
  buyer_comment: string | null; instructions: string | null; tracking_ref: string | null
  disposition: string | null; refund_minor: number | null; resolved_without_return: boolean
  created_at: string
  lines: Array<{ line_no: number; quantity: number }>
}

const ACTOR = { type: 'system' as const, id: 'returns' }

export class PgReturnsRepository {
  constructor(private readonly events: EventStore) {}

  async listByOrder(tx: Tx, orderId: string): Promise<ReturnCaseView[]> {
    const client = asClient(tx)
    const { rows } = await client.query<Omit<ReturnCaseView, 'lines'>>(
      `SELECT id, order_id, state, reason_code, buyer_comment, instructions, tracking_ref,
              disposition, refund_minor::int AS refund_minor, resolved_without_return, created_at::text AS created_at
       FROM return_cases WHERE order_id = $1 ORDER BY created_at`, [orderId])
    const cases: ReturnCaseView[] = []
    for (const row of rows) {
      const { rows: lines } = await client.query<{ line_no: number; quantity: number }>(
        `SELECT line_no, quantity FROM return_case_lines WHERE case_id = $1 ORDER BY line_no`, [row.id])
      cases.push({ ...row, lines })
    }
    return cases
  }

  async listOpenByBusiness(tx: Tx, businessId: string): Promise<ReturnCaseView[]> {
    const { rows } = await asClient(tx).query<{ id: string; order_id: string }>(
      `SELECT id, order_id FROM return_cases WHERE business_id = $1 AND state IN ('requested','authorized') ORDER BY created_at`, [businessId])
    const out: ReturnCaseView[] = []
    for (const r of rows) {
      const cases = await this.listByOrder(tx, r.order_id)
      const match = cases.find((c) => c.id === r.id)
      if (match) out.push(match)
    }
    return out
  }

  /**
   * Merchant returns queue (SV-3) — every case across all four states, newest first, a
   * projection of the return state machine. Minimum disclosure: order id, state, reason,
   * tracking, refund, line count — no buyer name/address/email (a list needs none).
   */
  async listByBusiness(tx: Tx, businessId: string, limit = 100): Promise<Array<{
    id: string; order_id: string; state: string; reason_code: string | null; tracking_ref: string | null
    refund_minor: number; resolved_without_return: boolean; line_count: number; created_at: string
  }>> {
    const { rows } = await asClient(tx).query<{
      id: string; order_id: string; state: string; reason_code: string | null; tracking_ref: string | null
      refund_minor: number; resolved_without_return: boolean; line_count: number; created_at: string
    }>(
      `SELECT c.id, c.order_id, c.state, c.reason_code, c.tracking_ref,
              COALESCE(c.refund_minor, 0)::int AS refund_minor, c.resolved_without_return, c.created_at::text AS created_at,
              (SELECT count(*)::int FROM return_case_lines l WHERE l.case_id = c.id) AS line_count
       FROM return_cases c WHERE c.business_id = $1
       ORDER BY c.created_at DESC LIMIT $2`, [businessId, limit])
    return rows
  }

  /** The buyer's ask. One open case per order at a time (simple, honest v1). */
  async request(tx: Tx, input: {
    businessId: string; orderId: string; storeId: string
    lines: Array<{ line_no: number; quantity: number }>
    reasonCode: string; buyerComment: string | null
  }): Promise<{ ok: true; caseId: string } | { ok: false; detail: string }> {
    const client = asClient(tx)
    const { rows: open } = await client.query<{ id: string }>(
      `SELECT id FROM return_cases WHERE order_id = $1 AND state IN ('requested','authorized') LIMIT 1`, [input.orderId])
    if (open[0]) return { ok: false, detail: 'A return is already underway for this order — one at a time keeps it simple.' }
    const caseId = uuidv7()
    await client.query(
      `INSERT INTO return_cases (id, business_id, order_id, store_id, state, reason_code, buyer_comment)
       VALUES ($1, $2, $3, $4, 'requested', $5, $6)`,
      [caseId, input.businessId, input.orderId, input.storeId, input.reasonCode, input.buyerComment])
    for (const line of input.lines) {
      await client.query(`INSERT INTO return_case_lines (case_id, line_no, quantity) VALUES ($1, $2, $3)`,
        [caseId, line.line_no, line.quantity])
    }
    await this.emit(tx, input, caseId, 'operations.return.requested', { reason_code: input.reasonCode })
    return { ok: true, caseId }
  }

  /** The maker's yes (with their instructions), or the generous shortcut. */
  async authorize(tx: Tx, caseId: string, instructions: string | null): Promise<{ ok: boolean; state: string }> {
    const client = asClient(tx)
    const { rows } = await client.query<{ state: string; business_id: string; order_id: string; store_id: string }>(
      `SELECT state, business_id, order_id, store_id FROM return_cases WHERE id = $1 FOR UPDATE`, [caseId])
    const c = rows[0]
    if (!c) return { ok: false, state: 'missing' }
    if (c.state === 'authorized') return { ok: true, state: 'authorized' } // idempotent
    if (c.state !== 'requested') return { ok: false, state: c.state }
    await client.query(`UPDATE return_cases SET state = 'authorized', instructions = $2, updated_at = now() WHERE id = $1`, [caseId, instructions])
    await this.emit(tx, { businessId: c.business_id, orderId: c.order_id, storeId: c.store_id }, caseId, 'operations.return.authorized', {})
    return { ok: true, state: 'authorized' }
  }

  async decline(tx: Tx, caseId: string, note: string | null): Promise<{ ok: boolean; state: string }> {
    const client = asClient(tx)
    const { rows } = await client.query<{ state: string }>(
      `SELECT state FROM return_cases WHERE id = $1 FOR UPDATE`, [caseId])
    if (!rows[0]) return { ok: false, state: 'missing' }
    if (rows[0].state === 'declined') return { ok: true, state: 'declined' }
    if (rows[0].state !== 'requested') return { ok: false, state: rows[0].state }
    await client.query(`UPDATE return_cases SET state = 'declined', instructions = $2, updated_at = now() WHERE id = $1`, [caseId, note])
    return { ok: true, state: 'declined' }
  }

  /** Buyer-entered manual return tracking (any time while authorized). */
  async recordTracking(tx: Tx, caseId: string, trackingRef: string): Promise<boolean> {
    const result = await asClient(tx).query(
      `UPDATE return_cases SET tracking_ref = $2, updated_at = now() WHERE id = $1 AND state = 'authorized'`, [caseId, trackingRef])
    return (result.rowCount ?? 0) > 0
  }

  /**
   * THE resolution — received, inspected, disposed, one action (also serves
   * refund-without-return straight from 'requested': generosity, RT1).
   * Idempotent: resolving a resolved case answers quietly (hostile scenario 5;
   * two operators racing take the row lock in turn — scenario 10).
   * The composition root refunds and restocks around this call.
   */
  async resolve(tx: Tx, input: {
    caseId: string; disposition: 'restock' | 'discard'; refundMinor: number; withoutReturn: boolean
  }): Promise<{ ok: true; alreadyResolved: boolean; case: { business_id: string; order_id: string; store_id: string; lines: Array<{ line_no: number; quantity: number }> } } | { ok: false; state: string }> {
    const client = asClient(tx)
    const { rows } = await client.query<{ state: string; business_id: string; order_id: string; store_id: string }>(
      `SELECT state, business_id, order_id, store_id FROM return_cases WHERE id = $1 FOR UPDATE`, [input.caseId])
    const c = rows[0]
    if (!c) return { ok: false, state: 'missing' }
    const { rows: lines } = await client.query<{ line_no: number; quantity: number }>(
      `SELECT line_no, quantity FROM return_case_lines WHERE case_id = $1`, [input.caseId])
    const view = { business_id: c.business_id, order_id: c.order_id, store_id: c.store_id, lines }
    if (c.state === 'resolved') return { ok: true, alreadyResolved: true, case: view }
    if (c.state !== 'authorized' && !(input.withoutReturn && c.state === 'requested')) {
      return { ok: false, state: c.state }
    }
    await client.query(
      `UPDATE return_cases SET state = 'resolved', disposition = $2, refund_minor = $3,
              resolved_without_return = $4, updated_at = now() WHERE id = $1`,
      [input.caseId, input.disposition, input.refundMinor, input.withoutReturn])
    await this.emit(tx, { businessId: c.business_id, orderId: c.order_id, storeId: c.store_id }, input.caseId, 'operations.return.resolved', {
      refund_minor: input.refundMinor, disposition: input.disposition,
    })
    return { ok: true, alreadyResolved: false, case: view }
  }

  private async emit(tx: Tx, refs: { businessId: string; orderId: string; storeId: string }, caseId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
    await this.events.append(tx, [{
      businessId: refs.businessId,
      aggregate: { type: 'return_case', id: caseId },
      eventType,
      schemaVersion: 1,
      payload: { return_case_id: caseId, order_id: refs.orderId, business_id: refs.businessId, store_id: refs.storeId, ...payload },
      actor: ACTOR,
    }])
  }
}
