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
      buyer_id: string; total_minor: string; shipping_minor: string; currency: string; order_number: string
    }>(
      `SELECT id, state, attempt_key, business_id, store_id, buyer_id, total_minor::text, shipping_minor::text, currency, order_number
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

    // ——— the single capture (partial exactly when the race dropped a line);
    // shipping rides with the goods: charged when anything survives to ship
    const captureMinor = survivingMinor + (survivingMinor > 0 ? Number(order.shipping_minor) : 0)
    const captured = await this.payments.capture(tx, { attemptKey: order.attempt_key, amountMinor: captureMinor, orderId })
    if (!captured.ok) {
      await client.query(`UPDATE orders SET state = 'payment_pending' WHERE id = $1`, [orderId])
      return { ok: true, state: 'payment_pending' } // the sweep retries; buyer copy stays calm
    }

    // ——— certainty: the state, the story, the facts
    const newTotal = captureMinor
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

  /**
   * THE KEYSTONE'S TEETH (C6 — ORR-C2, campaign directive): the three-stage
   * no-ship aging path. Runs on the cron clock; idempotent (the aging_stage
   * ratchet only moves forward), restartable (each stage re-derives from
   * dates, never from memory — hostile scenario 9: a cron dead for days
   * resumes and walks each order through every due stage), bounded (LIMIT
   * per stage per tick), observable (every stage writes the timeline; stage
   * 3 alarms on any failure).
   *
   *   Stage 1 · promise passed        → the calm merchant nudge ("Did this ship?")
   *   Stage 2 · +3 days grace         → the buyer is told plainly
   *   Stage 3 · +7 days               → automatic refund of the undispatched
   *                                     amount; lines closed honestly; alarm
   *                                     ONLY if a step fails
   *
   * "Dispatched" facts come from the case port; refunds go through the ONE
   * payments primitive (cause-keyed → replay-safe even if this sweep and an
   * operator race — hostile scenario 10).
   */
  async sweepAging(tx: Tx, deps: {
    listCases: (tx: Tx, orderId: string) => Promise<Array<{ state: string; lines: Array<{ line_no: number }> }>>
    refund: (tx: Tx, input: { orderId: string; amountMinor: number; causeKey: string; cause: Record<string, unknown> }) =>
      Promise<{ ok: true; refundId: string; alreadyDone: boolean } | { ok: false; detail: string }>
  }, now = new Date()): Promise<{ nudged: number; disclosed: number; refunded: number }> {
    const client = asClient(tx)
    const nowIso = now.toISOString()
    const out = { nudged: 0, disclosed: 0, refunded: 0 }

    // Stage 1 — the calm nudge (merchant-facing only; no buyer alarm)
    const { rows: s1 } = await client.query<{ id: string }>(
      `UPDATE orders SET aging_stage = 1
       WHERE aging_stage = 0 AND promise_ship_by IS NOT NULL AND promise_ship_by < $1
         AND state IN ('confirmed','in_fulfillment','partially_fulfilled')
       AND id IN (SELECT id FROM orders WHERE aging_stage = 0 AND promise_ship_by < $1
                  AND state IN ('confirmed','in_fulfillment','partially_fulfilled') LIMIT 50)
       RETURNING id`, [nowIso])
    out.nudged = s1.length

    // Stage 2 — the plain-words buyer disclosure (grace = 3 days past promise)
    const { rows: s2 } = await client.query<{ id: string; business_id: string; store_id: string }>(
      `UPDATE orders SET aging_stage = 2
       WHERE aging_stage = 1 AND promise_ship_by < $1::timestamptz - interval '3 days'
         AND state IN ('confirmed','in_fulfillment','partially_fulfilled')
       AND id IN (SELECT id FROM orders WHERE aging_stage = 1
                  AND promise_ship_by < $1::timestamptz - interval '3 days'
                  AND state IN ('confirmed','in_fulfillment','partially_fulfilled') LIMIT 50)
       RETURNING id, business_id, store_id`, [nowIso])
    for (const o of s2) {
      await this.timeline(client, o.id, 'note', {
        text: 'The promised ship-by date has passed. If it doesn’t ship within the next few days, your money for the unshipped items comes back automatically — that’s the promise.',
      })
      await this.events.append(tx, [this.orderEvent(o, 'orders.order.promise_missed', {})])
      out.disclosed += 1
    }

    // Stage 3 — the automatic refund (7 days past promise; the keystone, kept)
    const { rows: s3 } = await client.query<{
      id: string; order_number: string; state: string; total_minor: string; shipping_minor: string; currency: string
      business_id: string; store_id: string
    }>(
      `SELECT id, order_number, state, total_minor::text, shipping_minor::text, currency, business_id, store_id FROM orders
       WHERE aging_stage = 2 AND promise_ship_by < $1::timestamptz - interval '7 days'
         AND state IN ('confirmed','in_fulfillment','partially_fulfilled')
       LIMIT 20 FOR UPDATE`, [nowIso])
    for (const order of s3) {
      try {
        const cases = await deps.listCases(tx, order.id)
        const dispatchedLines = new Set(
          cases.filter((c) => ['dispatched', 'collected', 'granted'].includes(c.state)).flatMap((c) => c.lines.map((l) => l.line_no)))
        const { rows: lines } = await client.query<{ line_no: number; unit_price_minor: string; quantity: number; line_state: string; title: string }>(
          `SELECT line_no, unit_price_minor::text, quantity, line_state, title FROM order_lines WHERE order_id = $1 FOR UPDATE`, [order.id])
        const undispatched = lines.filter((l) => l.line_state === 'committed' && !dispatchedLines.has(l.line_no))
        let refundMinor = undispatched.reduce((sum, l) => sum + Number(l.unit_price_minor) * l.quantity, 0)
        // if NOTHING shipped, the shipping cost comes back too — the whole promise failed
        if (dispatchedLines.size === 0) refundMinor += Number(order.shipping_minor)
        if (refundMinor > 0) {
          const refunded = await deps.refund(tx, {
            orderId: order.id, amountMinor: refundMinor,
            causeKey: `no-ship-aging:${order.id}`,
            cause: { kind: 'no_ship_auto_refund', order_number: order.order_number },
          })
          if (!refunded.ok) {
            this.alarm(`[orders] KEYSTONE STAGE-3 REFUND FAILED for order ${order.id} (${order.order_number}): ${refunded.detail} — manual refund required NOW`)
            continue // ratchet stays at 2; next tick retries; the alarm is loud
          }
        }
        for (const l of undispatched) {
          await client.query(`UPDATE order_lines SET line_state = 'cancelled' WHERE order_id = $1 AND line_no = $2`, [order.id, l.line_no])
        }
        const anythingShipped = dispatchedLines.size > 0
        await client.query(
          `UPDATE orders SET aging_stage = 3, state = $2, total_minor = total_minor - $3 WHERE id = $1`,
          [order.id, anythingShipped ? order.state : 'cancelled', refundMinor])
        await this.timeline(client, order.id, 'refund', {
          amount_minor: refundMinor, currency: order.currency,
          text: anythingShipped
            ? 'The unshipped part of this order was refunded automatically — the shipped items are unaffected.'
            : 'This order didn’t ship, so your money is on its way back automatically. Nothing more will be charged.',
        })
        await this.events.append(tx, [this.orderEvent(order, 'orders.order.cancelled', {
          reason: 'no_ship_auto_refund', refunded_minor: refundMinor,
        })])
        out.refunded += 1
      } catch (error) {
        this.alarm(`[orders] KEYSTONE STAGE-3 CRASHED for order ${order.id}: ${(error as Error).message} — manual review required`)
      }
    }
    return out
  }

  // ————————————————————————————————— C6: the order's fulfillment reactions
  // (the endpoint orchestrates the Operations case transition + this reaction
  // in ONE transaction — the checkout/reservation pattern)

  /** The bench moment: packed, with the optional parcel photo riding along. */
  async recordPacked(tx: Tx, orderId: string, parcelMediaId: string | null): Promise<void> {
    const client = asClient(tx)
    const { rows: dup } = await client.query<{ id: string }>(
      `SELECT id FROM order_timeline WHERE order_id = $1 AND entry_type = 'packed' LIMIT 1`, [orderId])
    if (dup[0]) return // idempotent: one packed chapter
    await client.query(`UPDATE orders SET state = 'in_fulfillment' WHERE id = $1 AND state = 'confirmed'`, [orderId])
    await this.timeline(client, orderId, 'packed', {
      ...(parcelMediaId ? { parcel_media_id: parcelMediaId } : {}),
      text: 'Packed and ready to go.',
    })
  }

  /** Dispatch: lines leave the bench; partial shipments narrate honestly. */
  async recordDispatch(tx: Tx, orderId: string, input: {
    lineNos: number[]; carrier: string | null; trackingRef: string | null; method: 'ship' | 'pickup'
  }): Promise<{ orderState: string }> {
    const client = asClient(tx)
    for (const lineNo of input.lineNos) {
      await client.query(
        `UPDATE order_lines SET line_state = 'fulfilled' WHERE order_id = $1 AND line_no = $2 AND line_state IN ('committed','in_fulfillment')`,
        [orderId, lineNo])
    }
    const { rows: counts } = await client.query<{ open: number; total: number }>(
      `SELECT count(*) FILTER (WHERE line_state NOT IN ('fulfilled','cancelled','returned'))::int AS open,
              count(*)::int AS total
       FROM order_lines WHERE order_id = $1`, [orderId])
    const allDone = (counts[0]?.open ?? 0) === 0
    const newState = allDone ? 'fulfilled' : 'partially_fulfilled'
    await client.query(
      `UPDATE orders SET state = $2 WHERE id = $1 AND state IN ('confirmed','in_fulfillment','partially_fulfilled')`,
      [orderId, newState])
    const { rows: titles } = await client.query<{ title: string }>(
      `SELECT title FROM order_lines WHERE order_id = $1 AND line_no = ANY($2::int[]) ORDER BY line_no`, [orderId, input.lineNos])
    await this.timeline(client, orderId, input.method === 'pickup' ? 'ready' : 'shipped', {
      titles: titles.map((t) => t.title),
      partial: !allDone,
      ...(input.carrier ? { carrier: input.carrier } : {}),
      ...(input.trackingRef ? { tracking_ref: input.trackingRef } : {}),
    })
    return { orderState: newState }
  }

  /** The handover (pickup collected). */
  async recordHandover(tx: Tx, orderId: string): Promise<void> {
    const client = asClient(tx)
    const { rows: dup } = await client.query<{ id: string }>(
      `SELECT id FROM order_timeline WHERE order_id = $1 AND entry_type = 'delivered' LIMIT 1`, [orderId])
    if (dup[0]) return
    await client.query(
      `UPDATE order_lines SET line_state = 'fulfilled' WHERE order_id = $1 AND line_state IN ('committed','in_fulfillment')`, [orderId])
    await client.query(
      `UPDATE orders SET state = 'fulfilled' WHERE id = $1 AND state IN ('confirmed','in_fulfillment','partially_fulfilled')`, [orderId])
    await this.timeline(client, orderId, 'delivered', { text: 'Picked up — it’s in your hands.' })
  }

  /**
   * The payout-hold clock (C6 — ORR-C3): candidates are fulfilled-ish orders
   * whose hold hasn't released; the DECISION is the one pure policy
   * (payments/hold-policy via the injected evaluator through releaseHold's
   * caller); the MOVEMENT is the one payments primitive. Idempotent twice
   * over (hold_released_at guard + releaseHold's cause key). Bounded.
   */
  async sweepHoldRelease(tx: Tx, deps: {
    listCases: (tx: Tx, orderId: string) => Promise<Array<{ method: 'ship' | 'pickup' | 'digital'; state: string; dispatched_at: string | null; handed_over_at: string | null }>>
    releaseHold: (tx: Tx, input: { orderId: string; causeKey: string }) =>
      Promise<{ ok: true; releasedMinor: number; alreadyDone: boolean } | { ok: false; detail: string }>
    /** The ONE policy, injected by the composition root (no cross-domain import). */
    policy: (cases: Array<{ method: 'ship' | 'pickup' | 'digital'; state: string; dispatched_at: string | null; handed_over_at: string | null }>, now: Date) => boolean
  }, now = new Date()): Promise<number> {
    const client = asClient(tx)
    const { rows: candidates } = await client.query<{ id: string }>(
      `SELECT id FROM orders
       WHERE hold_released_at IS NULL AND state IN ('fulfilled','partially_fulfilled','completed')
       LIMIT 50 FOR UPDATE`)
    let released = 0
    for (const order of candidates) {
      const cases = await deps.listCases(tx, order.id)
      if (!deps.policy(cases, now)) continue
      const result = await deps.releaseHold(tx, { orderId: order.id, causeKey: `fulfillment-evidence:${order.id}` })
      if (!result.ok) {
        this.alarm(`[orders] HOLD RELEASE FAILED for order ${order.id}: ${result.detail} — payout eligibility stuck; manual review required`)
        continue
      }
      await client.query(`UPDATE orders SET hold_released_at = now() WHERE id = $1`, [order.id])
      await this.timeline(client, order.id, 'note', {
        text: 'Delivery evidence settled — the maker’s payout for this order is now on its way.',
      })
      released += 1
    }
    return released
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
