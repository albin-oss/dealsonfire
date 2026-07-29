/**
 * Order confirmation (Commerce Foundation C5 — ADR-007 §5, AMENDMENT-001 A1/A5).
 * The ceremony between `placed` and `confirmed`:
 *
 *   commit every reservation → the last-unit race resolves HERE, pre-capture,
 *   into an honest answer (a fallen line is excluded, told, and never charged —
 *   A7-5) → ONE full capture of the surviving amount (the single capture the
 *   verified Stripe reality allows; partial exactly when the race dropped a
 *   line) → `confirmed`, the timeline speaks, and the merchant hears about
 *   certainty, never noise (A7-8: the new-order moment fires at confirmed).
 *
 * Runs post-placement in its OWN transaction (the order exists even if this
 * crashes); the cron sweep retries stragglers, so `placed` is always a state
 * in motion, never a resting place. Idempotent end-to-end.
 */
import { uuidv7 } from '../../../../platform/uuid'
import type { Tx, EventStore } from '../../../../platform/types'
import { asClient } from '../../../../platform/db'
import type { PgStockRepository } from '../../../operations/inventory/application/stock'

/** Structural port onto the Payments capture (no cross-domain import). */
export interface CapturePort {
  capture(tx: Tx, input: { attemptKey: string; amountMinor: number; orderId: string }):
    Promise<{ ok: true; intentId: string } | { ok: false; detail: string }>
}

/** Structural port onto Operations fulfillment (C6 — no cross-domain import). */
export interface FulfillmentCasePort {
  createCase(tx: Tx, input: {
    businessId: string; orderId: string; storeId: string
    method: 'ship' | 'pickup' | 'digital'
    lines: Array<{ line_no: number; quantity: number }>
  }): Promise<{ caseId: string; granted: boolean }>
}

/**
 * Every outcome is ok:true — even cancellation is a successfully RESOLVED
 * confirmation (the house UnitOfWork rolls back ok:false returns, and a
 * resolved cancellation must persist its state and its honest timeline).
 */
export type ConfirmResult =
  | { ok: true; state: 'confirmed'; fallenLines: number }
  | { ok: true; state: 'payment_pending' }
  | { ok: true; state: 'cancelled'; reason: string }

export class PgConfirmService {
  constructor(
    private readonly events: EventStore,
    private readonly stock: PgStockRepository,
    private readonly payments: CapturePort,
    /** PRR-H1: the loud channel — a stuck payment is a record humans must see. */
    private readonly alarm: (message: string) => void = (m) => console.error(m),
    /** C6: cases are born at confirm — certainty first (A7-8), then the work. */
    private readonly fulfillment?: FulfillmentCasePort,
  ) {}

  async confirmOrder(tx: Tx, orderId: string): Promise<ConfirmResult | null> {
    const client = asClient(tx)
    const { rows: orders } = await client.query<{
      id: string; state: string; attempt_key: string; business_id: string; store_id: string
      buyer_id: string; total_minor: string; currency: string; order_number: string
    }>(
      `SELECT id, state, attempt_key, business_id, store_id, buyer_id, total_minor::text, currency, order_number
       FROM orders WHERE id = $1 FOR UPDATE`, [orderId])
    const order = orders[0]
    if (!order) return null
    if (order.state === 'confirmed') return { ok: true, state: 'confirmed', fallenLines: 0 } // idempotent
    if (order.state !== 'placed' && order.state !== 'payment_pending') return null

    const { rows: lines } = await client.query<{
      line_no: number; title: string; unit_price_minor: string; quantity: number
      reservation_id: string | null; line_state: string
    }>(`SELECT line_no, title, unit_price_minor::text, quantity, reservation_id, line_state
        FROM order_lines WHERE order_id = $1 ORDER BY line_no FOR UPDATE`, [orderId])

    // ——— commit the claims; the race answers honestly, line by line (A7-5)
    let survivingMinor = 0
    const fallen: Array<{ line_no: number; title: string }> = []
    for (const line of lines) {
      if (line.line_state === 'cancelled') continue
      if (line.line_state === 'committed') { survivingMinor += Number(line.unit_price_minor) * line.quantity; continue }
      const committed = line.reservation_id
        ? await this.stock.commitReservation(tx, line.reservation_id, { type: 'system', id: 'order-confirm' })
        : { ok: true as const, reservationId: '', alreadyCommitted: false }
      if (committed?.ok) {
        await client.query(`UPDATE order_lines SET line_state = 'committed' WHERE order_id = $1 AND line_no = $2`, [orderId, line.line_no])
        survivingMinor += Number(line.unit_price_minor) * line.quantity
      } else {
        // the last unit went to someone else while this buyer paid attention elsewhere:
        // the line falls, is never charged, and the timeline says so plainly
        await client.query(`UPDATE order_lines SET line_state = 'cancelled' WHERE order_id = $1 AND line_no = $2`, [orderId, line.line_no])
        fallen.push({ line_no: line.line_no, title: line.title })
      }
    }

    if (survivingMinor === 0) {
      await client.query(`UPDATE orders SET state = 'cancelled' WHERE id = $1`, [orderId])
      await this.timeline(client, orderId, 'note', { text: 'Everything in this order sold out before it could be confirmed — nothing was charged.' })
      await this.events.append(tx, [this.orderEvent(order, 'orders.order.cancelled', { reason: 'sold_out_at_confirm' })])
      return { ok: true, state: 'cancelled', reason: 'sold out at confirmation' }
    }

    // ——— the single capture (partial exactly when the race dropped a line)
    const captured = await this.payments.capture(tx, { attemptKey: order.attempt_key, amountMinor: survivingMinor, orderId })
    if (!captured.ok) {
      await client.query(`UPDATE orders SET state = 'payment_pending' WHERE id = $1`, [orderId])
      return { ok: true, state: 'payment_pending' } // the sweep retries; buyer copy stays calm
    }

    // ——— certainty: the state, the story, the facts
    const newTotal = survivingMinor
    await client.query(`UPDATE orders SET state = 'confirmed', total_minor = $2 WHERE id = $1`, [orderId, newTotal])
    for (const f of fallen) {
      await this.timeline(client, orderId, 'note', { text: `“${f.title}” sold out before confirmation — it was not charged.` })
    }
    await this.timeline(client, orderId, 'confirmed', { order_number: order.order_number })
    await this.timeline(client, orderId, 'payment', { total_minor: newTotal, currency: order.currency })

    // ——— C6: the promise snapshot + the cases (the work begins at certainty)
    if (this.fulfillment) {
      const { rows: meta } = await client.query<{ delivery_method: 'ship' | 'pickup' | 'digital'; handling_days: number }>(
        `SELECT o.delivery_method,
                COALESCE((a.quote->>'handling_days')::int, 3) AS handling_days
         FROM orders o LEFT JOIN checkout_attempts a ON a.attempt_key = o.attempt_key
         WHERE o.id = $1`, [orderId])
      const method = meta[0]?.delivery_method ?? 'ship'
      const handlingDays = meta[0]?.handling_days ?? 3
      const surviving = lines.filter((l) => l.line_state !== 'cancelled' && !fallen.some((f) => f.line_no === l.line_no))
      const { rows: kinds } = await client.query<{ line_no: number; fulfillment_kind: string; quantity: number }>(
        `SELECT line_no, fulfillment_kind, quantity FROM order_lines WHERE order_id = $1`, [orderId])
      const kindOf = new Map(kinds.map((k) => [k.line_no, k.fulfillment_kind]))
      const digitalLines = surviving.filter((l) => kindOf.get(l.line_no) === 'digital')
      const physicalLines = surviving.filter((l) => kindOf.get(l.line_no) !== 'digital')

      if (digitalLines.length > 0) {
        await this.fulfillment.createCase(tx, {
          businessId: order.business_id, orderId, storeId: order.store_id, method: 'digital',
          lines: digitalLines.map((l) => ({ line_no: l.line_no, quantity: l.quantity })),
        })
        for (const l of digitalLines) {
          await client.query(`UPDATE order_lines SET line_state = 'fulfilled' WHERE order_id = $1 AND line_no = $2`, [orderId, l.line_no])
        }
        await this.timeline(client, orderId, 'granted', { text: 'Your digital items are yours — no waiting on a parcel.' })
      }
      if (physicalLines.length > 0) {
        const shipBy = new Date(Date.now() + handlingDays * 86_400_000)
        await client.query(`UPDATE orders SET promise_ship_by = $2 WHERE id = $1`, [orderId, shipBy.toISOString()])
        await this.fulfillment.createCase(tx, {
          businessId: order.business_id, orderId, storeId: order.store_id,
          method: method === 'pickup' ? 'pickup' : 'ship',
          lines: physicalLines.map((l) => ({ line_no: l.line_no, quantity: l.quantity })),
        })
        await this.timeline(client, orderId, 'promise', {
          ship_by: shipBy.toISOString(), method: method === 'pickup' ? 'pickup' : 'ship',
        })
      } else if (digitalLines.length > 0) {
        // all-digital orders are fulfilled the moment they're confirmed
        await client.query(`UPDATE orders SET state = 'fulfilled' WHERE id = $1`, [orderId])
      }
    }
    await this.events.append(tx, [
      this.orderEvent(order, 'orders.order.confirmed', {
        total_minor: newTotal, currency: order.currency, fallen_lines: fallen.length,
      }),
    ])
    return { ok: true, state: 'confirmed', fallenLines: fallen.length }
  }

  /** Cron fallback: any order resting in `placed`/`payment_pending` gets another push. */
  async sweepUnconfirmed(tx: Tx, olderThanSeconds = 60): Promise<number> {
    const client = asClient(tx)

    // PRR-H1: retries are capped — after 24h in payment_pending the order fails
    // honestly (stock was committed; the correction is a human's reason-coded
    // adjustment, and the alarm makes sure a human knows). Never silent, never eternal.
    const { rows: stale } = await client.query<{ id: string; order_number: string; business_id: string; store_id: string }>(
      `UPDATE orders SET state = 'payment_failed'
       WHERE state = 'payment_pending' AND placed_at < now() - interval '24 hours'
       RETURNING id, order_number, business_id, store_id`)
    for (const order of stale) {
      await client.query(`UPDATE order_lines SET line_state = 'cancelled' WHERE order_id = $1 AND line_state <> 'cancelled'`, [order.id])
      await this.timeline(client, order.id, 'note', { text: 'The payment could not be completed — this order is closed and nothing more will be charged.' })
      this.alarm(`[orders] payment_pending exceeded 24h — order ${order.id} (${order.order_number}) marked payment_failed with COMMITTED stock; manual stock adjustment required (PRR-H1)`)
    }

    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM orders WHERE state IN ('placed','payment_pending')
       AND placed_at < now() - ($1 || ' seconds')::interval LIMIT 20`, [olderThanSeconds])
    let confirmed = 0
    for (const row of rows) {
      const result = await this.confirmOrder(tx, row.id)
      if (result && result.ok && result.state === 'confirmed') confirmed += 1
    }
    return confirmed
  }

  private async timeline(client: ReturnType<typeof asClient>, orderId: string, entryType: string, message: Record<string, unknown>): Promise<void> {
    await client.query(
      `INSERT INTO order_timeline (id, order_id, entry_type, message, actor) VALUES ($1, $2, $3, $4, $5)`,
      [uuidv7(), orderId, entryType, JSON.stringify(message), JSON.stringify({ type: 'system', id: 'order-confirm' })])
  }

  private orderEvent(order: { id: string; business_id: string; store_id: string }, eventType: string, payload: Record<string, unknown>) {
    return {
      businessId: order.business_id,
      aggregate: { type: 'order', id: order.id },
      eventType,
      schemaVersion: 1,
      payload: { order_id: order.id, business_id: order.business_id, store_id: order.store_id, ...payload },
      actor: { type: 'system' as const, id: 'order-confirm' },
    }
  }
}
