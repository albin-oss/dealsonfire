/**
 * Checkout saga + the immutable Order (Commerce Foundation C3 — ADR-007 §4/§5).
 *
 * One attempt key governs reserve → authorize → place (A7-2): a replay with the
 * same key RESUMES — re-lands on the same reservations (stable line ids stored in
 * the frozen quote), the same authorization, and ultimately the same order. Every
 * failure path names its compensation (K2): authorize-fail → release reservations;
 * place-fail → void authorization + release. The order is written once (O1) with
 * line snapshots and an append-only timeline; C3 ends at `placed` — confirmation
 * (reservation commit + capture + the first-sale Moment) is C5's ceremony.
 *
 * The PaymentPort here is the ADR-007 §6 port, verbatim; the sandbox adapter is
 * the day-one test law (A7-6). Stripe arrives behind the same port in C4.
 *
 * C3 TRANSACTION SEMANTICS (single-tx): the house UnitOfWork rolls back any
 * `{ok:false}` return — so a failed checkout leaves NO trace (no held stock, no
 * attempt row): the strongest possible compensation, and a same-key retry simply
 * re-runs. The step ledger + failure records become durable in C4, when the saga
 * splits into per-step transactions around the real (non-rollbackable) authorize.
 */
import { uuidv7 } from '../../../../platform/uuid'
import type { Tx, EventStore } from '../../../../platform/types'
import { asClient } from '../../../../platform/db'
import type { PgStockRepository } from '../../../operations/inventory/application/stock'
import { resolveEffectivePrice } from '../../../commerce/pricing/effective-price'

// ————————————————————————————————————————————— the PaymentPort (ADR-007 §6)

export interface PaymentPort {
  /**
   * C10 §7 — phase 1 only: reads the intent's recorded truth or journals the
   * intent-to-authorize. NEVER calls the provider (the boundary drives that
   * outside this transaction; the saga re-enters afterwards and converges).
   */
  requestAuthorization(tx: Tx, input: { attemptKey: string; amountMinor: number; currency: string; businessId?: string }):
    Promise<{ state: 'authorized' | 'captured' | 'failed' | 'pending' | 'requires_action'; opId: string | null; providerRef: string | null }>
  /** Slice 2: a refreshed browser re-asks — the recorded intent answers. */
  peekIntent(tx: Tx, attemptKey: string): Promise<{ state: string; providerRef: string | null } | null>
}

// ————————————————————————————————————————————— shapes

export interface BuyerContact { name: string; email: string }
export interface DeliveryAddress { line1: string; city: string; postal_code: string; country: string }

interface QuoteLine {
  order_line_id: string  // stable across replays — the reservation idempotency key
  line_no: number
  variant_id: string
  product_id: string
  title: string
  option_label: string | null
  unit_price_minor: number
  quantity: number
  fulfillment_kind: 'physical' | 'digital' | 'service'
}
interface FrozenQuote {
  lines: QuoteLine[]
  subtotal_minor: number; shipping_minor: number; total_minor: number; currency: string
  method: 'ship' | 'pickup' | 'digital'
  handling_days: number
}

/** Structural port onto the Operations shipping profile (no cross-domain import). */
export interface ShippingQuotePort {
  getOrDefaultProfile(tx: Tx, businessId: string, storeId: string): Promise<{
    handling_days: number; flat_rate_minor: number; free_over_minor: number | null; pickup_enabled: boolean
  }>
  shippingCost(profile: { flat_rate_minor: number; free_over_minor: number | null }, method: 'ship' | 'pickup' | 'digital', subtotalMinor: number): number
}

export type CheckoutResult =
  | { ok: true; orderId: string; orderNumber: string; alreadyPlaced: boolean; awaitingPayment?: boolean; providerRef?: string | null }
  /** §7: reservations + journal COMMIT; the endpoint drives the boundary, then re-enters. */
  | { ok: true; pendingAuthorization: true; opId: string }
  /** §7: a decline recorded AFTER commit must persist its cleanup — ok:true shape (rollback law). */
  | { ok: true; declined: true; code: 'PAYMENT_DECLINED'; detail: string }
  | { ok: false; code: 'CART_CHANGED'; detail: string }
  | { ok: false; code: 'OUT_OF_STOCK'; detail: string; available?: number }
  | { ok: false; code: 'PAYMENT_DECLINED'; detail: string }
  | { ok: false; code: 'ATTEMPT_FAILED'; detail: string }

const ATTEMPT_TTL_SECONDS = 900 // = the reservation TTL proposal (K3: never longer)

export class PgCheckoutService {
  constructor(
    private readonly events: EventStore,
    private readonly stock: PgStockRepository,
    private readonly payments: PaymentPort,
    private readonly shipping: ShippingQuotePort,
  ) {}

  /**
   * The whole saga, resumable by attempt key. Caller runs each invocation inside
   * ONE transaction (the monolith's steps are strongly consistent together; the
   * external authorize sits between DB work and is idempotent by attempt key).
   */
  async checkout(tx: Tx, input: {
    attemptKey: string
    buyerId: string
    cartId: string
    contact: BuyerContact
    delivery: DeliveryAddress
    /** ship (default) | pickup (when the store allows it); digital resolves itself. */
    method?: 'ship' | 'pickup'
  }): Promise<CheckoutResult> {
    const client = asClient(tx)

    // ——— resume-or-begin (K1)
    const { rows: existing } = await client.query<{
      id: string; step: string; order_id: string | null; failure_code: string | null; quote: FrozenQuote; auth_ref: string | null
      business_id: string; store_id: string
    }>(`SELECT id, step, order_id, failure_code, quote, auth_ref, business_id, store_id
        FROM checkout_attempts WHERE attempt_key = $1 FOR UPDATE`, [input.attemptKey])
    let attempt = existing[0] ?? null

    if (attempt?.step === 'placed' && attempt.order_id) {
      const { rows } = await client.query<{ order_number: string }>(`SELECT order_number FROM orders WHERE id = $1`, [attempt.order_id])
      // Slice 2: a refreshed browser must get its payment session back
      const peek = await this.payments.peekIntent(tx, input.attemptKey)
      return {
        ok: true, orderId: attempt.order_id, orderNumber: rows[0]!.order_number, alreadyPlaced: true,
        awaitingPayment: peek?.state === 'requires_action', providerRef: peek?.providerRef ?? null,
      }
    }
    if (attempt?.step === 'failed') {
      // a recorded decline replays as the same honest decline (P3: facts persist)
      if (attempt.failure_code === 'PAYMENT_DECLINED') {
        return { ok: false, code: 'PAYMENT_DECLINED', detail: 'The payment method declined. Nothing was charged; your cart is exactly as you left it.' }
      }
      return { ok: false, code: 'ATTEMPT_FAILED', detail: 'This checkout could not finish — start again from your cart; nothing was charged.' }
    }

    // ——— quote (frozen at first entry; replays reuse it — stable line ids)
    if (!attempt) {
      const quoted = await this.quoteCart(tx, input.buyerId, input.cartId, input.method ?? 'ship')
      if (!quoted.ok) return quoted.error
      const attemptId = uuidv7()
      const inserted = await client.query(
        `INSERT INTO checkout_attempts (id, attempt_key, buyer_id, cart_id, business_id, store_id, step, contact, delivery, quote, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'reserving', $7, $8, $9, $10)
         ON CONFLICT (attempt_key) DO NOTHING`,
        [attemptId, input.attemptKey, input.buyerId, input.cartId, quoted.businessId, quoted.storeId,
         JSON.stringify(input.contact), JSON.stringify(input.delivery), JSON.stringify(quoted.quote),
         new Date(Date.now() + ATTEMPT_TTL_SECONDS * 1000).toISOString()])
      if (inserted.rowCount === 0) {
        // a concurrent tab won the insert — block on its row until it commits, then converge (A7-2)
        const { rows: winner } = await client.query<typeof existing[number]>(
          `SELECT id, step, order_id, failure_code, quote, auth_ref, business_id, store_id
           FROM checkout_attempts WHERE attempt_key = $1 FOR UPDATE`, [input.attemptKey])
        const w = winner[0]!
        if (w.step === 'placed' && w.order_id) {
          const { rows } = await client.query<{ order_number: string }>(`SELECT order_number FROM orders WHERE id = $1`, [w.order_id])
          return { ok: true, orderId: w.order_id, orderNumber: rows[0]!.order_number, alreadyPlaced: true }
        }
        if (w.step === 'failed') {
          return { ok: false, code: 'ATTEMPT_FAILED', detail: w.failure_code ?? 'This checkout could not finish — start again from your cart; nothing was charged.' }
        }
        attempt = w // winner crashed mid-flight: resume its saga with its frozen quote
      } else {
        attempt = { id: attemptId, step: 'reserving', order_id: null, failure_code: null, quote: quoted.quote, auth_ref: null, business_id: quoted.businessId, store_id: quoted.storeId }
      }
    }
    const quote = attempt.quote

    // ——— reserve (idempotent per line by order_line_id — CDC-001)
    const reservationIds: string[] = []
    for (const line of quote.lines) {
      const reserved = await this.stock.reserveStock(tx, {
        orderLineId: line.order_line_id, businessId: attempt.business_id,
        variantId: line.variant_id, quantity: line.quantity, ttlSeconds: ATTEMPT_TTL_SECONDS,
      })
      if (!reserved.ok) {
        // compensation: release what this attempt already holds, fail honestly
        await this.releaseAll(tx, reservationIds)
        await this.fail(client, attempt.id, 'OUT_OF_STOCK')
        return { ok: false, code: 'OUT_OF_STOCK', available: reserved.available,
                 detail: `Only ${reserved.available} of “${line.title}” ${reserved.available === 1 ? 'is' : 'are'} left — your card was not charged.` }
      }
      reservationIds.push(reserved.reservationId)
    }
    await client.query(`UPDATE checkout_attempts SET step = 'authorizing', reservation_ids = $2, updated_at = now() WHERE id = $1`,
      [attempt.id, JSON.stringify(reservationIds)])

    // ——— authorize (§7 two-phase): phase 1 journals; the boundary drives the
    // provider OUTSIDE this transaction; the saga re-enters and reads the truth
    let authRef = attempt.auth_ref
    let awaitingPayment: boolean
    if (!authRef) {
      const req = await this.payments.requestAuthorization(tx, { attemptKey: input.attemptKey, amountMinor: quote.total_minor, currency: quote.currency, businessId: attempt.business_id })
      if (req.state === 'pending') {
        // reservations + attempt + journal COMMIT (ok:true shape); the endpoint drives and re-enters
        return { ok: true, pendingAuthorization: true, opId: req.opId! }
      }
      if (req.state === 'failed') {
        // the recorded decline: cleanup must PERSIST (rollback law) — ok:true shape
        await this.releaseAll(tx, reservationIds)
        await this.fail(client, attempt.id, 'PAYMENT_DECLINED')
        return { ok: true, declined: true, code: 'PAYMENT_DECLINED', detail: 'The payment method declined. Nothing was charged; your cart is exactly as you left it.' }
      }
      // 'authorized'/'captured' proceed to place; 'requires_action' (Slice 2 —
      // Payment Element) ALSO places: the order exists while the buyer confirms,
      // and nothing commits or charges until the intent moves.
      awaitingPayment = req.state === 'requires_action'
      authRef = req.providerRef ?? 'recorded'
      await client.query(`UPDATE checkout_attempts SET step = 'placing', auth_ref = $2, updated_at = now() WHERE id = $1`, [attempt.id, authRef])
    } else {
      const peek = await this.payments.peekIntent(tx, input.attemptKey)
      awaitingPayment = peek?.state === 'requires_action'
    }

    // ——— place (the last gate: UNIQUE attempt_key on orders makes storms converge)
    try {
      const orderId = uuidv7()
      const orderNumber = await this.nextOrderNumber(tx, attempt.store_id)
      await client.query(
        `INSERT INTO orders (id, order_number, attempt_key, business_id, store_id, buyer_id, buyer_contact, delivery,
                             subtotal_minor, shipping_minor, total_minor, currency, state, delivery_method)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'placed', $13)`,
        [orderId, orderNumber, input.attemptKey, attempt.business_id, attempt.store_id, input.buyerId,
         JSON.stringify(input.contact), JSON.stringify(input.delivery),
         quote.subtotal_minor, quote.shipping_minor, quote.total_minor, quote.currency, quote.method ?? 'ship'])
      for (const line of quote.lines) {
        await client.query(
          `INSERT INTO order_lines (order_id, line_no, variant_id, product_id, title, option_label, unit_price_minor, quantity, reservation_id, line_state, fulfillment_kind)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'reserved', $10)`,
          [orderId, line.line_no, line.variant_id, line.product_id, line.title, line.option_label,
           line.unit_price_minor, line.quantity, reservationIds[line.line_no - 1] ?? null, line.fulfillment_kind ?? 'physical'])
      }
      await client.query(
        `INSERT INTO order_timeline (id, order_id, entry_type, message, actor)
         VALUES ($1, $2, 'placed', $3, $4)`,
        [uuidv7(), orderId, JSON.stringify({ order_number: orderNumber, total_minor: quote.total_minor, currency: quote.currency }),
         JSON.stringify({ type: 'guest', id: input.buyerId })])
      await client.query(`UPDATE checkout_attempts SET step = 'placed', order_id = $2, updated_at = now() WHERE id = $1`, [attempt.id, orderId])
      await client.query(`UPDATE carts SET status = 'merged', updated_at = now() WHERE id = $1 AND status = 'active'`, [input.cartId])
      await this.events.append(tx, [{
        businessId: attempt.business_id,
        aggregate: { type: 'order', id: orderId },
        eventType: 'orders.order.placed',
        schemaVersion: 1,
        payload: { order_id: orderId, business_id: attempt.business_id, store_id: attempt.store_id, total_minor: quote.total_minor, currency: quote.currency, line_count: quote.lines.length },
        actor: { type: 'guest', id: input.buyerId },
      }])
      return { ok: true, orderId, orderNumber, alreadyPlaced: false, awaitingPayment, providerRef: authRef }
    } catch (error) {
      // place-fail compensation (K2): release the claims; the orphaned
      // authorization is reclaimed by the boundary's orphan-void sweep (§7 —
      // an inline provider void here would run inside this open transaction)
      await this.releaseAll(tx, reservationIds)
      await this.fail(client, attempt.id, 'PLACE_FAILED')
      throw error
    }
  }

  /** Live quote from the cart under the full visibility conjunction (fail-closed). */
  private async quoteCart(tx: Tx, buyerId: string, cartId: string, method: 'ship' | 'pickup'): Promise<
    { ok: true; businessId: string; storeId: string; quote: FrozenQuote } | { ok: false; error: CheckoutResult & { ok: false } }> {
    const client = asClient(tx)
    const { rows } = await client.query<{
      business_id: string; store_id: string; variant_id: string; product_id: string
      title: string; option_values: Record<string, string> | null; quantity: number
      base_price: string | null; sale_amount: string | null; sale_starts_at: Date | null; sale_ends_at: Date | null
      currency: string | null; available: boolean
      fulfillment_kind: 'physical' | 'digital' | 'service' | null
    }>(
      `SELECT c.business_id, c.store_id, cl.variant_id, cl.product_id,
              COALESCE(p.title, cl.title_seen) AS title, v.option_values, cl.quantity,
              p.fulfillment_kind,
              v.price_amount::text AS base_price, v.sale_amount::text AS sale_amount,
              v.sale_starts_at, v.sale_ends_at, v.price_currency AS currency,
              (v.id IS NOT NULL AND p.id IS NOT NULL AND p.status <> 'archived' AND p.deleted_at IS NULL
               AND s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL
               AND EXISTS (SELECT 1 FROM listings l WHERE l.product_id = cl.product_id
                           AND l.channel_id = c.store_id AND l.status = 'published')) AS available
       FROM carts c
       JOIN stores s ON s.id = c.store_id
       JOIN cart_lines cl ON cl.cart_id = c.id
       LEFT JOIN product_variants v ON v.id = cl.variant_id
       LEFT JOIN products p ON p.id = cl.product_id
       WHERE c.id = $1 AND c.buyer_kind = 'visitor' AND c.buyer_id = $2 AND c.status = 'active'
       ORDER BY cl.added_at ASC`, [cartId, buyerId])
    if (rows.length === 0) {
      return { ok: false, error: { ok: false, code: 'CART_CHANGED', detail: 'This cart is empty or no longer exists — nothing was charged.' } }
    }
    const gone = rows.filter((r) => !r.available)
    if (gone.length > 0) {
      return { ok: false, error: { ok: false, code: 'CART_CHANGED',
        detail: `“${gone[0]!.title}” is no longer available from this shop — remove it from your cart to continue. Nothing was charged.` } }
    }
    // EP-1: one authoritative price. Charge re-resolves through the SAME service the
    // storefront uses — window-checked sale, offer socket — at ONE quote instant. This is
    // the fix for the old window-blind COALESCE that could charge an expired/future sale.
    const at = new Date()
    // Single-currency-per-order law (ADR-002 multi-currency deferred): a cart may not mix.
    if (new Set(rows.map((r) => r.currency ?? 'EUR')).size > 1) {
      return { ok: false, error: { ok: false, code: 'CART_CHANGED',
        detail: 'This cart mixes currencies, which a single order can’t carry — nothing was charged.' } }
    }
    const lines: QuoteLine[] = rows.map((r, i) => ({
      order_line_id: uuidv7(), line_no: i + 1,
      variant_id: r.variant_id, product_id: r.product_id, title: r.title,
      option_label: Object.values(r.option_values ?? {}).filter(Boolean).join(' · ') || null,
      unit_price_minor: resolveEffectivePrice({
        baseUnitAmount: Number(r.base_price), currency: r.currency ?? 'EUR',
        sale: r.sale_amount != null && r.sale_starts_at && r.sale_ends_at
          ? { amount: Number(r.sale_amount), startsAt: r.sale_starts_at, endsAt: r.sale_ends_at } : null,
        at,
      }).effectiveUnitAmount,
      quantity: r.quantity,
      fulfillment_kind: r.fulfillment_kind ?? 'physical',
    }))
    const subtotal = lines.reduce((sum, l) => sum + l.unit_price_minor * l.quantity, 0)

    // the method resolves: all-digital carts need no address or postage; pickup
    // must be allowed by the store's profile; everything else ships (C6)
    const businessId = rows[0]!.business_id
    const storeId = rows[0]!.store_id
    const allDigital = lines.every((l) => l.fulfillment_kind === 'digital')
    const profile = await this.shipping.getOrDefaultProfile(tx, businessId, storeId)
    let resolvedMethod: FrozenQuote['method'] = allDigital ? 'digital' : method
    if (resolvedMethod === 'pickup' && !profile.pickup_enabled) resolvedMethod = 'ship'
    const shipping = this.shipping.shippingCost(profile, resolvedMethod, subtotal)

    return {
      ok: true, businessId, storeId,
      quote: {
        lines, subtotal_minor: subtotal, shipping_minor: shipping, total_minor: subtotal + shipping,
        currency: rows[0]!.currency ?? 'EUR', method: resolvedMethod, handling_days: profile.handling_days,
      },
    }
  }

  private async releaseAll(tx: Tx, reservationIds: string[]): Promise<void> {
    for (const id of reservationIds) await this.stock.releaseReservation(tx, id)
  }

  private async fail(client: ReturnType<typeof asClient>, attemptId: string, code: string): Promise<void> {
    await client.query(`UPDATE checkout_attempts SET step = 'failed', failure_code = $2, updated_at = now() WHERE id = $1`, [attemptId, code])
  }

  private async nextOrderNumber(tx: Tx, storeId: string): Promise<string> {
    const { rows } = await asClient(tx).query<{ next_no: string }>(
      `INSERT INTO order_counters (store_id, next_no) VALUES ($1, 2)
       ON CONFLICT (store_id) DO UPDATE SET next_no = order_counters.next_no + 1
       RETURNING next_no`, [storeId])
    // RETURNING sees the post-write row: first insert → 2, conflicts → old+1;
    // the issued number is always next_no − 1 (row-locked, gapless per store)
    return `#${Number(rows[0]!.next_no) - 1}`
  }

  // ——————————————————————————————————————————— buyer reads (the timeline story)

  async getBuyerOrder(tx: Tx, buyerId: string, orderId: string): Promise<{
    order: {
      id: string; order_number: string; state: string; placed_at: string
      store_handle: string; store_name: string
      subtotal_minor: number; shipping_minor: number; total_minor: number; currency: string
      contact_name: string; delivery: DeliveryAddress
      promise_ship_by: string | null; delivery_method: string
      cancel_requested: boolean
    }
    lines: Array<{ line_no: number; title: string; option_label: string | null; unit_price_minor: number; quantity: number; line_state: string; product_id: string; image_url: string | null }>
    timeline: Array<{ entry_type: string; message: Record<string, unknown>; occurred_at: string }>
    wait_sparks: Array<{ id: string; body: string; published_at: string; image_url: string | null }>
    maker_promise: string | null
  } | null> {
    const client = asClient(tx)
    const { rows: orders } = await client.query<{
      id: string; order_number: string; state: string; placed_at: string
      store_handle: string; store_name: string; store_id: string
      subtotal_minor: string; shipping_minor: string; total_minor: string; currency: string
      buyer_contact: BuyerContact; delivery: DeliveryAddress
      promise_ship_by: string | null; delivery_method: string
      cancel_requested_at: string | null
    }>(
      `SELECT o.id, o.order_number, o.state, o.placed_at::text AS placed_at,
              s.handle AS store_handle, s.name AS store_name, o.store_id,
              o.subtotal_minor::text, o.shipping_minor::text, o.total_minor::text, o.currency,
              o.buyer_contact, o.delivery, o.promise_ship_by::text AS promise_ship_by, o.delivery_method,
              o.cancel_requested_at::text AS cancel_requested_at
       FROM orders o JOIN stores s ON s.id = o.store_id
       WHERE o.id = $1 AND o.buyer_id = $2`, [orderId, buyerId])
    const order = orders[0]
    if (!order) return null
    const { rows: lines } = await client.query<{
      line_no: number; title: string; option_label: string | null; unit_price_minor: string; quantity: number; line_state: string; product_id: string; image_url: string | null
    }>(
      `SELECT ol.line_no, ol.title, ol.option_label, ol.unit_price_minor::text, ol.quantity, ol.line_state, ol.product_id, img.url AS image_url
       FROM order_lines ol
       LEFT JOIN LATERAL (
         SELECT ma.url FROM product_media pm JOIN media_assets ma ON ma.id = pm.media_id
         WHERE pm.product_id = ol.product_id ORDER BY (pm.role = 'hero') DESC, pm.position ASC LIMIT 1
       ) img ON true
       WHERE ol.order_id = $1 ORDER BY ol.line_no`, [orderId])
    const { rows: timeline } = await client.query<{ entry_type: string; message: Record<string, unknown>; occurred_at: string }>(
      `SELECT entry_type, message, occurred_at::text AS occurred_at FROM order_timeline
        WHERE order_id = $1 AND NOT COALESCE((message->>'internal')::boolean, false)
        ORDER BY occurred_at ASC`, [orderId])

    // C6 — the Workshop Wait (SX-1): the maker's PUBLIC sparks from the buyer's
    // wait window, interleaved into the story. Real events only; zero merchant work.
    const { rows: waitSparks } = await client.query<{ id: string; body: string; published_at: string; image_url: string | null }>(
      `SELECT sp.id, sp.body, sp.published_at::text AS published_at, ma.url AS image_url
       FROM sparks sp
       LEFT JOIN media_assets ma ON ma.id = sp.media_id
       JOIN orders o ON o.id = $1
       WHERE sp.channel_id = o.store_id AND sp.status = 'published'
         AND sp.published_at >= o.placed_at
       ORDER BY sp.published_at ASC LIMIT 3`, [orderId])

    // the maker's sign-off (SM-3): their standing promise line, in their words
    const { rows: signoff } = await client.query<{ promise: string | null }>(
      `SELECT b.voice->>'promise' AS promise FROM brand_kits b
       JOIN orders o ON o.id = $1
       WHERE b.owner_type = 'store' AND b.owner_id = o.store_id`, [orderId])

    return {
      order: {
        id: order.id, order_number: order.order_number, state: order.state, placed_at: order.placed_at,
        store_handle: order.store_handle, store_name: order.store_name,
        subtotal_minor: Number(order.subtotal_minor), shipping_minor: Number(order.shipping_minor),
        total_minor: Number(order.total_minor), currency: order.currency,
        contact_name: order.buyer_contact?.name ?? '', delivery: order.delivery,
        promise_ship_by: order.promise_ship_by, delivery_method: order.delivery_method,
        cancel_requested: order.cancel_requested_at !== null,
      },
      lines: lines.map((l) => ({ ...l, unit_price_minor: Number(l.unit_price_minor) })),
      timeline,
      wait_sparks: waitSparks,
      maker_promise: signoff[0]?.promise ?? null,
    }
  }

  /**
   * PRR-M1: the manifest's retention promise, kept — terminal attempts (placed or
   * failed) carry buyer PII snapshots and purge after 30 days.
   */
  async purgeTerminalAttempts(tx: Tx, now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString()
    const result = await asClient(tx).query(
      `DELETE FROM checkout_attempts WHERE step IN ('placed','failed') AND updated_at < $1`, [cutoff])
    return result.rowCount ?? 0
  }

  /**
   * The merchant's orders — promises in progress (THE_DOF_WORKSHOP §2 verdict:
   * parcels and promise language, never a status table). Confirmed-first (A7-8:
   * the merchant's list leads with certainty), then the quiet exceptions.
   */
  async listBusinessOrders(tx: Tx, businessId: string): Promise<Array<{
    id: string; order_number: string; state: string; placed_at: string
    buyer_name: string; buyer_email: string; delivery: DeliveryAddress
    total_minor: number; currency: string
    promise_ship_by: string | null; aging_stage: number; delivery_method: string; hold_released_at: string | null
    cancel_requested: boolean
    items: Array<{ title: string; option_label: string | null; quantity: number; line_state: string }>
  }>> {
    const client = asClient(tx)
    const { rows } = await client.query<{
      id: string; order_number: string; state: string; placed_at: string
      buyer_contact: BuyerContact; delivery: DeliveryAddress; total_minor: string; currency: string
      promise_ship_by: string | null; aging_stage: number; delivery_method: string; hold_released_at: string | null
      cancel_requested_at: string | null
    }>(
      `SELECT id, order_number, state, placed_at::text AS placed_at, buyer_contact, delivery, total_minor::text, currency,
              promise_ship_by::text AS promise_ship_by, aging_stage, delivery_method, hold_released_at::text AS hold_released_at,
              cancel_requested_at::text AS cancel_requested_at
       FROM orders WHERE business_id = $1
       ORDER BY (state IN ('confirmed','in_fulfillment','partially_fulfilled')) DESC, placed_at DESC LIMIT 100`, [businessId])
    const result = []
    for (const o of rows) {
      const { rows: items } = await client.query<{ title: string; option_label: string | null; quantity: number; line_state: string }>(
        `SELECT title, option_label, quantity, line_state FROM order_lines WHERE order_id = $1 ORDER BY line_no`, [o.id])
      result.push({
        id: o.id, order_number: o.order_number, state: o.state, placed_at: o.placed_at,
        // ORR-C1: the fulfiller sees where to ship and how to reach the buyer —
        // legitimate, necessary fulfillment PII (manifest P2; never in events)
        buyer_name: o.buyer_contact?.name ?? '', buyer_email: o.buyer_contact?.email ?? '',
        delivery: o.delivery,
        total_minor: Number(o.total_minor), currency: o.currency,
        promise_ship_by: o.promise_ship_by, aging_stage: o.aging_stage,
        delivery_method: o.delivery_method, hold_released_at: o.hold_released_at,
        cancel_requested: o.cancel_requested_at !== null,
        items,
      })
    }
    return result
  }

  async listBuyerOrders(tx: Tx, buyerId: string): Promise<Array<{
    id: string; order_number: string; state: string; placed_at: string; store_handle: string; store_name: string; total_minor: number; currency: string; line_count: number
  }>> {
    const { rows } = await asClient(tx).query<{
      id: string; order_number: string; state: string; placed_at: string; store_handle: string; store_name: string; total_minor: string; currency: string; line_count: number
    }>(
      `SELECT o.id, o.order_number, o.state, o.placed_at::text AS placed_at, s.handle AS store_handle, s.name AS store_name,
              o.total_minor::text, o.currency, (SELECT count(*)::int FROM order_lines ol WHERE ol.order_id = o.id) AS line_count
       FROM orders o JOIN stores s ON s.id = o.store_id
       WHERE o.buyer_id = $1 ORDER BY o.placed_at DESC LIMIT 50`, [buyerId])
    return rows.map((r) => ({ ...r, total_minor: Number(r.total_minor) }))
  }
}
