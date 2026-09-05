/**
 * Stock & Reservations (Commerce Foundation C2 — ADR-006 §4, CDC-001 §2.2 VERBATIM).
 * The frozen consumer contract, implemented:
 *
 *  - ReserveStock: idempotent on orderLineId (a retry returns the original claim);
 *    untracked/digital variants get a recorded NO-OP claim — the interface is uniform,
 *    Orders never branches on tracking mode. Tracked declines carry what IS available
 *    (educating answers). TTL is Orders-proposed, Operations-CLAMPED.
 *  - ReleaseReservation: idempotent; releasing a terminal claim is a silent no-op
 *    with a distinguishing flag.
 *  - CommitReservation: claim → 'sold' ledger line atomically under the item lock;
 *    committing an expired claim answers RESERVATION_EXPIRED — the last-unit race's
 *    honest resolution (ADR-007 A7-5).
 *  - The expiry sweep (Operations-owned clock) emits `operations.reservation.expired`;
 *    Orders MUST consume it and free the cart line.
 *
 * Oversell prevention: every availability decision happens under SELECT … FOR UPDATE
 * on the stock item row — the contention lives here by design (ADR-007 §9).
 */
import { uuidv7 } from '../../../../platform/uuid'
import type { Tx, EventStore } from '../../../../platform/types'
import { asClient } from '../../../../platform/db'

/** TTL clamp window (blueprint §4.3): Orders proposes, Operations decides. */
const TTL_MIN_SECONDS = 300
const TTL_MAX_SECONDS = 1800

export type ReserveResult =
  | { ok: true; reservationId: string; status: 'active' | 'committed' | 'released' | 'expired'; noop: boolean }
  | { ok: false; code: 'RESERVATION_DECLINED'; available: number }

export type CommitResult =
  | { ok: true; reservationId: string; alreadyCommitted: boolean }
  | { ok: false; code: 'RESERVATION_EXPIRED' }

export interface ReleaseResult { released: boolean; priorStatus: 'active' | 'committed' | 'released' | 'expired' }

export class PgStockRepository {
  constructor(private readonly events: EventStore) {}

  /** CDC-001: ReserveStock({ orderLineId, businessId, variantId, quantity, ttl }). */
  async reserveStock(tx: Tx, input: {
    orderLineId: string; businessId: string; variantId: string; quantity: number; ttlSeconds?: number
  }): Promise<ReserveResult> {
    const client = asClient(tx)

    // idempotency on the natural key: a retry returns the ORIGINAL reservation
    const { rows: existing } = await client.query<{ id: string; status: 'active' | 'committed' | 'released' | 'expired'; stock_item_id: string | null }>(
      `SELECT id, status, stock_item_id FROM reservations WHERE order_line_id = $1`, [input.orderLineId])
    if (existing[0]) {
      return { ok: true, reservationId: existing[0].id, status: existing[0].status, noop: existing[0].stock_item_id === null }
    }

    const ttl = Math.min(Math.max(input.ttlSeconds ?? 900, TTL_MIN_SECONDS), TTL_MAX_SECONDS)
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()

    // resolve the tracked stock item (if any) UNDER THE ROW LOCK — the one gate
    const { rows: items } = await client.query<{ id: string; on_hand: number }>(
      `SELECT id, on_hand FROM stock_items
       WHERE variant_id = $1 AND business_id = $2 AND tracking_mode = 'tracked'
       ORDER BY created_at ASC LIMIT 1
       FOR UPDATE`, [input.variantId, input.businessId])
    const item = items[0]

    const reservationId = uuidv7()
    if (!item) {
      // untracked / digital / made-to-order: the recorded no-op claim (uniform interface)
      await client.query(
        `INSERT INTO reservations (id, order_line_id, business_id, variant_id, stock_item_id, quantity, status, expires_at)
         VALUES ($1, $2, $3, $4, NULL, $5, 'active', $6)`,
        [reservationId, input.orderLineId, input.businessId, input.variantId, input.quantity, expiresAt])
      return { ok: true, reservationId, status: 'active', noop: true }
    }

    const { rows: held } = await client.query<{ held: number }>(
      `SELECT COALESCE(sum(quantity), 0)::int AS held FROM reservations
       WHERE stock_item_id = $1 AND status = 'active' AND expires_at > now()`, [item.id])
    const available = item.on_hand - (held[0]?.held ?? 0)
    if (available < input.quantity) {
      return { ok: false, code: 'RESERVATION_DECLINED', available: Math.max(available, 0) }
    }

    await client.query(
      `INSERT INTO reservations (id, order_line_id, business_id, variant_id, stock_item_id, quantity, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)`,
      [reservationId, input.orderLineId, input.businessId, input.variantId, item.id, input.quantity, expiresAt])
    return { ok: true, reservationId, status: 'active', noop: false }
  }

  /** CDC-001: idempotent; terminal states answer with the distinguishing flag. */
  async releaseReservation(tx: Tx, reservationId: string): Promise<ReleaseResult | null> {
    const client = asClient(tx)
    const { rows } = await client.query<{ status: ReleaseResult['priorStatus'] }>(
      `SELECT status FROM reservations WHERE id = $1 FOR UPDATE`, [reservationId])
    if (!rows[0]) return null
    if (rows[0].status !== 'active') return { released: false, priorStatus: rows[0].status }
    await client.query(`UPDATE reservations SET status = 'released', updated_at = now() WHERE id = $1`, [reservationId])
    return { released: true, priorStatus: 'active' }
  }

  /**
   * CDC-001: claim → sold atomically; expired → RESERVATION_EXPIRED (Orders re-reserves
   * or re-offers honestly). Idempotent: committing a committed claim succeeds quietly.
   */
  async commitReservation(tx: Tx, reservationId: string, actor: { type: string; id: string }): Promise<CommitResult | null> {
    const client = asClient(tx)
    const { rows } = await client.query<{
      status: 'active' | 'committed' | 'released' | 'expired'; expired_now: boolean
      stock_item_id: string | null; business_id: string; quantity: number; order_line_id: string
    }>(
      `SELECT status, (status = 'active' AND expires_at <= now()) AS expired_now,
              stock_item_id, business_id, quantity, order_line_id
       FROM reservations WHERE id = $1 FOR UPDATE`, [reservationId])
    const r = rows[0]
    if (!r) return null
    if (r.status === 'committed') return { ok: true, reservationId, alreadyCommitted: true }
    if (r.status === 'expired' || r.status === 'released' || r.expired_now) return { ok: false, code: 'RESERVATION_EXPIRED' }

    if (r.stock_item_id !== null) {
      // lock the item, write the sold line, move the cached sum — one transaction
      await client.query(`SELECT id FROM stock_items WHERE id = $1 FOR UPDATE`, [r.stock_item_id])
      await client.query(
        `INSERT INTO stock_ledger (id, business_id, stock_item_id, delta, reason, cause_ref, actor)
         VALUES ($1, $2, $3, $4, 'sold', $5, $6)`,
        [uuidv7(), r.business_id, r.stock_item_id, -r.quantity,
         JSON.stringify({ reservation_id: reservationId, order_line_id: r.order_line_id }), JSON.stringify(actor)])
      await client.query(`UPDATE stock_items SET on_hand = on_hand - $2, updated_at = now() WHERE id = $1`, [r.stock_item_id, r.quantity])
    }
    await client.query(`UPDATE reservations SET status = 'committed', updated_at = now() WHERE id = $1`, [reservationId])
    return { ok: true, reservationId, alreadyCommitted: false }
  }

  /** AvailabilityQuery (advisory — the binding check is ReserveStock itself). */
  async availability(tx: Tx, businessId: string, variantId: string): Promise<{ tracked: boolean; available: number | null }> {
    const client = asClient(tx)
    const { rows } = await client.query<{ available: number }>(
      `SELECT si.on_hand - COALESCE((SELECT sum(r.quantity) FROM reservations r
                WHERE r.stock_item_id = si.id AND r.status = 'active' AND r.expires_at > now()), 0)::int AS available
       FROM stock_items si
       WHERE si.variant_id = $1 AND si.business_id = $2 AND si.tracking_mode = 'tracked'`,
      [variantId, businessId])
    if (rows.length === 0) return { tracked: false, available: null }
    return { tracked: true, available: Math.max(rows.reduce((sum, r) => sum + Number(r.available), 0), 0) }
  }

  /**
   * The expiry sweep (Operations-owned clock, CDC-001 frozen lifecycle): active past
   * expires_at → 'expired' + `operations.reservation.expired`. One transaction per
   * batch; flipped rows never match again (idempotent by construction).
   */
  async sweepExpired(tx: Tx, now = new Date()): Promise<number> {
    const client = asClient(tx)
    const { rows } = await client.query<{ id: string; order_line_id: string; business_id: string; variant_id: string }>(
      `UPDATE reservations SET status = 'expired', updated_at = now()
       WHERE status = 'active' AND expires_at <= $1
       RETURNING id, order_line_id, business_id, variant_id`, [now.toISOString()])
    for (const r of rows) {
      await this.events.append(tx, [{
        businessId: r.business_id,
        aggregate: { type: 'reservation', id: r.id },
        eventType: 'operations.reservation.expired',
        schemaVersion: 1,
        payload: { reservation_id: r.id, order_line_id: r.order_line_id, variant_id: r.variant_id },
        actor: { type: 'system', id: 'reservation-expiry-sweep' },
      }])
    }
    return rows.length
  }

  /**
   * Restock a COMMITTED claim (C8 cancellations / C9 returns): the sold ledger
   * line reverses with a reason-coded 'returned' entry and the cached sum moves
   * back. Idempotent per reservation (one restock, ever). No-op claims restock
   * nothing (there was no stock to move).
   */
  async restockCommitted(tx: Tx, reservationId: string, actor: { type: string; id: string }): Promise<{ restocked: boolean }> {
    const client = asClient(tx)
    const { rows } = await client.query<{ status: string; stock_item_id: string | null; business_id: string; quantity: number; order_line_id: string }>(
      `SELECT status, stock_item_id, business_id, quantity, order_line_id FROM reservations WHERE id = $1 FOR UPDATE`, [reservationId])
    const r = rows[0]
    if (!r || r.status !== 'committed' || r.stock_item_id === null) return { restocked: false }
    const { rows: prior } = await client.query<{ id: string }>(
      `SELECT id FROM stock_ledger WHERE stock_item_id = $1 AND reason = 'returned' AND cause_ref->>'reservation_id' = $2 LIMIT 1`,
      [r.stock_item_id, reservationId])
    if (prior[0]) return { restocked: false } // already restocked — idempotent
    await client.query(`SELECT id FROM stock_items WHERE id = $1 FOR UPDATE`, [r.stock_item_id])
    await client.query(
      `INSERT INTO stock_ledger (id, business_id, stock_item_id, delta, reason, cause_ref, actor)
       VALUES ($1, $2, $3, $4, 'returned', $5, $6)`,
      [uuidv7(), r.business_id, r.stock_item_id, r.quantity,
       JSON.stringify({ reservation_id: reservationId, order_line_id: r.order_line_id }), JSON.stringify(actor)])
    await client.query(`UPDATE stock_items SET on_hand = on_hand + $2, updated_at = now() WHERE id = $1`, [r.stock_item_id, r.quantity])
    return { restocked: true }
  }

  /**
   * Merchant manual adjustment (SV-3) — the ONLY merchant write into stock, and the one
   * that turns tracking ON. Set-count ('counted') or ±delta ('adjusted'), reason-coded on
   * the append-only ledger with the acting merchant, under the SAME row lock as reserving
   * (oversell contention lives on this row). Creates the stock item on first touch (opening
   * count) at the given location, flipping it to 'tracked'.
   *
   * Guard: the new on-hand may never drop below what in-progress checkouts already hold
   * (active, unexpired reservations) — so on_hand always covers its reservations and a
   * later commit can never violate the on_hand >= 0 invariant. Refuses below zero too.
   */
  async adjustStock(tx: Tx, input: {
    businessId: string; variantId: string; locationId: string
    mode: 'set' | 'delta'; quantity: number; actor: { type: string; id: string }; note?: string | null
  }): Promise<{ ok: true; onHand: number; reserved: number } | { ok: false; code: 'INVALID_ADJUSTMENT'; message: string; heldReserved?: number }> {
    const client = asClient(tx)
    const { rows: found } = await client.query<{ id: string; on_hand: number }>(
      `SELECT id, on_hand FROM stock_items WHERE variant_id = $1 AND location_id = $2 FOR UPDATE`,
      [input.variantId, input.locationId])
    let item = found[0]
    if (!item) {
      const id = uuidv7()
      await client.query(
        `INSERT INTO stock_items (id, business_id, variant_id, location_id, tracking_mode, on_hand)
         VALUES ($1, $2, $3, $4, 'tracked', 0)`,
        [id, input.businessId, input.variantId, input.locationId])
      item = { id, on_hand: 0 }
    } else {
      await client.query(`UPDATE stock_items SET tracking_mode = 'tracked', updated_at = now() WHERE id = $1`, [item.id])
    }

    const target = input.mode === 'set' ? input.quantity : item.on_hand + input.quantity
    if (!Number.isInteger(target) || target < 0) {
      return { ok: false, code: 'INVALID_ADJUSTMENT', message: 'stock cannot go below zero' }
    }
    const { rows: heldRows } = await client.query<{ held: number }>(
      `SELECT COALESCE(sum(quantity), 0)::int AS held FROM reservations
       WHERE stock_item_id = $1 AND status = 'active' AND expires_at > now()`, [item.id])
    const held = heldRows[0]?.held ?? 0
    if (target < held) {
      return { ok: false, code: 'INVALID_ADJUSTMENT', message: `${held} in progress right now — can't set below that`, heldReserved: held }
    }

    const delta = target - item.on_hand
    if (delta !== 0) {
      await client.query(
        `INSERT INTO stock_ledger (id, business_id, stock_item_id, delta, reason, cause_ref, actor)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [uuidv7(), input.businessId, item.id, delta, input.mode === 'set' ? 'counted' : 'adjusted',
         JSON.stringify({ note: input.note ?? null }), JSON.stringify(input.actor)])
      await client.query(`UPDATE stock_items SET on_hand = $2, updated_at = now() WHERE id = $1`, [item.id, target])
    }
    return { ok: true, onHand: target, reserved: held }
  }

  /**
   * Merchant inventory read (SV-3) — every sellable variant with its stock truth, catalog-
   * driven so untracked variants surface too. `available` = on_hand − active reservations
   * (floored), null when untracked (always sellable). Bounded; keyset paging is a later seam.
   */
  async listInventoryForBusiness(tx: Tx, businessId: string, limit = 200): Promise<Array<{
    product_id: string; title: string; variant_id: string; sku: string; option_values: Record<string, unknown>
    tracked: boolean; on_hand: number | null; reserved: number; available: number | null
  }>> {
    const { rows } = await asClient(tx).query<{
      product_id: string; title: string; variant_id: string; sku: string; option_values: Record<string, unknown>
      tracking_mode: string | null; on_hand: number | null; reserved: number
    }>(
      `SELECT p.id AS product_id, p.title, v.id AS variant_id, v.sku, v.option_values,
              si.tracking_mode, si.on_hand,
              COALESCE((SELECT sum(r.quantity)::int FROM reservations r
                        WHERE r.stock_item_id = si.id AND r.status = 'active' AND r.expires_at > now()), 0) AS reserved
       FROM products p
       JOIN product_variants v ON v.product_id = p.id
       LEFT JOIN stock_items si ON si.variant_id = v.id AND si.business_id = p.business_id
       WHERE p.business_id = $1 AND p.deleted_at IS NULL AND p.status <> 'archived'
       ORDER BY p.title ASC, v.position ASC
       LIMIT $2`, [businessId, limit])
    return rows.map((r) => {
      const tracked = r.tracking_mode === 'tracked'
      const onHand = tracked ? Number(r.on_hand ?? 0) : null
      return {
        product_id: r.product_id, title: r.title, variant_id: r.variant_id, sku: r.sku,
        option_values: r.option_values ?? {}, tracked, on_hand: onHand, reserved: r.reserved,
        available: tracked ? Math.max((onHand ?? 0) - r.reserved, 0) : null,
      }
    })
  }

  /** StockAtLocationPort (L2): a location holding tracked stock cannot close. */
  async hasStock(tx: Tx, locationId: string): Promise<boolean> {
    const { rows } = await asClient(tx).query<{ n: number }>(
      `SELECT count(*)::int AS n FROM stock_items WHERE location_id = $1 AND tracking_mode = 'tracked' AND on_hand > 0`,
      [locationId])
    return (rows[0]?.n ?? 0) > 0
  }
}
