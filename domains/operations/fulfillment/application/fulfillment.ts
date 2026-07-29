/**
 * Fulfillment & Shipping (Commerce Foundation C6 — ADR-006 shipping module v1,
 * CDC-001 case semantics, ORR-corrected DoD).
 *
 * Operations owns the PHYSICAL truth: the shipping profile (the merchant's
 * promise-making settings) and the fulfillment case (the parcel's life). Orders
 * owns the order; the composition root orchestrates both in one transaction —
 * the same pattern checkout uses with reservations. Cases group lines by method;
 * partial dispatch SPLITS a case (F-6: partial fulfillment is first-class);
 * digital cases grant instantly; pickup cases ready → collected.
 *
 * The quote half (rate resolution) is deterministic and dumb on purpose:
 * flat rate, free-over threshold, pickup = 0 — v1 of SP2's ZoneResolution,
 * with zones arriving when real merchants need them.
 */
import { uuidv7 } from '../../../../platform/uuid'
import type { Tx } from '../../../../platform/types'
import { asClient } from '../../../../platform/db'

export interface ShippingProfile {
  id: string; business_id: string; store_id: string
  handling_days: number; flat_rate_minor: number; free_over_minor: number | null
  pickup_enabled: boolean; currency: string
}

export interface FulfillmentCase {
  id: string; order_id: string; method: 'ship' | 'pickup' | 'digital'; state: string
  tracking_carrier: string | null; tracking_ref: string | null; parcel_media_id: string | null
  packed_at: string | null; dispatched_at: string | null; handed_over_at: string | null
  lines: Array<{ line_no: number; quantity: number }>
}

export class PgFulfillmentRepository {
  // ————————————————————————————————— shipping profile (the promise settings)

  async getOrDefaultProfile(tx: Tx, businessId: string, storeId: string): Promise<ShippingProfile> {
    const client = asClient(tx)
    const { rows } = await client.query<ShippingProfile>(
      `SELECT id, business_id, store_id, handling_days, flat_rate_minor::int AS flat_rate_minor,
              free_over_minor::int AS free_over_minor, pickup_enabled, currency
       FROM shipping_profiles WHERE store_id = $1`, [storeId])
    if (rows[0]) return rows[0]
    // the honest default: 3 handling days, free shipping — a profile row is
    // created lazily on first merchant edit, not here (reads never write)
    return {
      id: '', business_id: businessId, store_id: storeId,
      handling_days: 3, flat_rate_minor: 0, free_over_minor: null,
      pickup_enabled: false, currency: 'EUR',
    }
  }

  async upsertProfile(tx: Tx, input: {
    businessId: string; storeId: string
    handlingDays: number; flatRateMinor: number; freeOverMinor: number | null; pickupEnabled: boolean
  }): Promise<void> {
    await asClient(tx).query(
      `INSERT INTO shipping_profiles (id, business_id, store_id, handling_days, flat_rate_minor, free_over_minor, pickup_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (store_id) DO UPDATE SET
         handling_days = EXCLUDED.handling_days, flat_rate_minor = EXCLUDED.flat_rate_minor,
         free_over_minor = EXCLUDED.free_over_minor, pickup_enabled = EXCLUDED.pickup_enabled,
         updated_at = now()`,
      [uuidv7(), input.businessId, input.storeId, input.handlingDays, input.flatRateMinor, input.freeOverMinor, input.pickupEnabled])
  }

  /** The one rate rule (centralized — R3.1's visible math gets its number here). */
  shippingCost(profile: ShippingProfile, method: 'ship' | 'pickup' | 'digital', subtotalMinor: number): number {
    if (method !== 'ship') return 0
    if (profile.free_over_minor !== null && subtotalMinor >= profile.free_over_minor) return 0
    return profile.flat_rate_minor
  }

  // ————————————————————————————————— cases (the parcel's life)

  /** Called by the confirm orchestration: one case per method group. */
  async createCase(tx: Tx, input: {
    businessId: string; orderId: string; storeId: string
    method: 'ship' | 'pickup' | 'digital'
    lines: Array<{ line_no: number; quantity: number }>
  }): Promise<{ caseId: string; granted: boolean }> {
    const client = asClient(tx)
    const caseId = uuidv7()
    const digital = input.method === 'digital'
    await client.query(
      `INSERT INTO fulfillment_cases (id, business_id, order_id, store_id, method, state, handed_over_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [caseId, input.businessId, input.orderId, input.storeId, input.method,
       digital ? 'granted' : 'open', digital ? new Date().toISOString() : null])
    for (const line of input.lines) {
      await client.query(
        `INSERT INTO fulfillment_case_lines (case_id, line_no, quantity) VALUES ($1, $2, $3)`,
        [caseId, line.line_no, line.quantity])
    }
    return { caseId, granted: digital }
  }

  async listByOrder(tx: Tx, orderId: string): Promise<FulfillmentCase[]> {
    const client = asClient(tx)
    const { rows } = await client.query<Omit<FulfillmentCase, 'lines'>>(
      `SELECT id, order_id, method, state, tracking_carrier, tracking_ref, parcel_media_id,
              packed_at::text AS packed_at, dispatched_at::text AS dispatched_at, handed_over_at::text AS handed_over_at
       FROM fulfillment_cases WHERE order_id = $1 ORDER BY created_at`, [orderId])
    const cases: FulfillmentCase[] = []
    for (const row of rows) {
      const { rows: lines } = await client.query<{ line_no: number; quantity: number }>(
        `SELECT line_no, quantity FROM fulfillment_case_lines WHERE case_id = $1 ORDER BY line_no`, [row.id])
      cases.push({ ...row, lines })
    }
    return cases
  }

  /** Pack: the bench moment — optional parcel photo rides along. Idempotent. */
  async pack(tx: Tx, caseId: string, parcelMediaId: string | null): Promise<{ ok: boolean; state: string }> {
    const { rows } = await asClient(tx).query<{ state: string }>(
      `UPDATE fulfillment_cases
       SET state = 'packed', packed_at = COALESCE(packed_at, now()),
           parcel_media_id = COALESCE($2, parcel_media_id), updated_at = now()
       WHERE id = $1 AND state IN ('open','packed')
       RETURNING state`, [caseId, parcelMediaId])
    if (rows[0]) return { ok: true, state: rows[0].state }
    const { rows: cur } = await asClient(tx).query<{ state: string }>(`SELECT state FROM fulfillment_cases WHERE id = $1`, [caseId])
    return { ok: false, state: cur[0]?.state ?? 'missing' }
  }

  /**
   * Dispatch, possibly partial: a subset of open lines SPLITS the case — the
   * dispatched half carries the tracking; the remainder stays open with its
   * own case (split shipment over multiple dates, hostile scenario 3).
   * Idempotent per case-state; returns the dispatched case id.
   */
  async dispatch(tx: Tx, input: {
    caseId: string; carrier: string | null; trackingRef: string | null
    lineNos?: number[]  // omit = everything still in the case
  }): Promise<{ ok: true; dispatchedCaseId: string; remainderCaseId: string | null; dispatchedLines: number[] } | { ok: false; state: string }> {
    const client = asClient(tx)
    const { rows: cases } = await client.query<{ id: string; state: string; business_id: string; order_id: string; store_id: string; method: string }>(
      `SELECT id, state, business_id, order_id, store_id, method FROM fulfillment_cases WHERE id = $1 FOR UPDATE`, [input.caseId])
    const c = cases[0]
    if (!c) return { ok: false, state: 'missing' }
    if (c.state === 'dispatched') return { ok: true, dispatchedCaseId: c.id, remainderCaseId: null, dispatchedLines: [] }
    if (c.state !== 'open' && c.state !== 'packed') return { ok: false, state: c.state }

    const { rows: caseLines } = await client.query<{ line_no: number; quantity: number }>(
      `SELECT line_no, quantity FROM fulfillment_case_lines WHERE case_id = $1 ORDER BY line_no`, [input.caseId])
    const chosen = input.lineNos && input.lineNos.length > 0
      ? caseLines.filter((l) => input.lineNos!.includes(l.line_no))
      : caseLines
    if (chosen.length === 0) return { ok: false, state: c.state }
    const remainder = caseLines.filter((l) => !chosen.some((ch) => ch.line_no === l.line_no))

    let remainderCaseId: string | null = null
    if (remainder.length > 0) {
      remainderCaseId = uuidv7()
      await client.query(
        `INSERT INTO fulfillment_cases (id, business_id, order_id, store_id, method, state)
         VALUES ($1, $2, $3, $4, $5, 'open')`,
        [remainderCaseId, c.business_id, c.order_id, c.store_id, c.method])
      for (const line of remainder) {
        await client.query(`UPDATE fulfillment_case_lines SET case_id = $1 WHERE case_id = $2 AND line_no = $3`,
          [remainderCaseId, input.caseId, line.line_no])
      }
    }
    await client.query(
      `UPDATE fulfillment_cases
       SET state = 'dispatched', dispatched_at = now(),
           tracking_carrier = $2, tracking_ref = $3, updated_at = now()
       WHERE id = $1`, [input.caseId, input.carrier, input.trackingRef])
    return { ok: true, dispatchedCaseId: c.id, remainderCaseId, dispatchedLines: chosen.map((l) => l.line_no) }
  }

  /** Pickup: ready → collected (the handover). Both idempotent. */
  async markReady(tx: Tx, caseId: string): Promise<boolean> {
    const result = await asClient(tx).query(
      `UPDATE fulfillment_cases SET state = 'ready', packed_at = COALESCE(packed_at, now()), updated_at = now()
       WHERE id = $1 AND state IN ('open','packed','ready')`, [caseId])
    return (result.rowCount ?? 0) > 0
  }

  async markCollected(tx: Tx, caseId: string): Promise<boolean> {
    const result = await asClient(tx).query(
      `UPDATE fulfillment_cases SET state = 'collected', handed_over_at = COALESCE(handed_over_at, now()), updated_at = now()
       WHERE id = $1 AND state IN ('ready','collected')`, [caseId])
    return (result.rowCount ?? 0) > 0
  }
}
