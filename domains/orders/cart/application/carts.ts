/**
 * Cart (Commerce Foundation C1 — ADR-007 §4, COMMERCE_ARCHITECTURE §5.1/§5.2).
 * The buyer's working document, never a promise: no reservations (A7-3), no price
 * assertions (C2 — lines carry what the buyer SAW; the read re-quotes against the
 * live listing conjunction), one active cart per (buyer, store) (C1). The street's
 * buyer identity is the visitor id — login continuity rides the identity-claim
 * seam, and merge-on-login is a line-union executed at the claim site.
 *
 * Cart mutations are working-document edits, not decisions — they are not audited
 * per-keystroke; the cart row is its own ledger. The one platform fact a cart ever
 * emits is `orders.cart.abandoned` (frozen taxonomy), from the sweep.
 */
import { uuidv7 } from '../../../../platform/uuid'
import type { Tx, EventStore } from '../../../../platform/types'
import { asClient } from '../../../../platform/db'
import { effectivePriceSql } from '../../../commerce/pricing/effective-price'

/** Max distinct lines per cart — a working document, not a warehouse order. */
const MAX_LINES = 50
const ABANDON_AFTER_DAYS = 30

export interface CartLineView {
  variant_id: string
  product_id: string
  product_title: string
  option_label: string | null
  quantity: number
  /** Live price (re-quoted this read) in minor units; null = variant gone. */
  price_minor: number | null
  currency: string | null
  /** What the buyer saw when the line landed — honesty flag when it moved. */
  price_seen_minor: number | null
  /** The full visibility conjunction, re-checked on this read. */
  available: boolean
  image_url: string | null
  image_alt: string | null
}

export interface CartView {
  cart_id: string
  store_handle: string
  store_name: string
  lines: CartLineView[]
  subtotal_minor: number
  currency: string | null
  updated_at: string
}

export class PgCartRepository {
  constructor(private readonly events: EventStore) {}

  /**
   * Set a line to an absolute quantity (0 removes) — idempotent by natural key
   * (buyer, variant). Creates the (buyer, store) cart on first use. The variant
   * must be visible (published listing ∧ live store ∧ product not archived) to
   * ENTER a cart; lines already in carts survive hiding and render honestly.
   * Returns null when the variant is not visible (caller masks to 404 — V6).
   */
  async setLine(tx: Tx, visitorId: string, variantId: string, quantity: number): Promise<{ cartId: string; lines: number } | null> {
    const client = asClient(tx)
    const { rows: vis } = await client.query<{
      product_id: string; business_id: string; store_id: string; price: string; currency: string
      title: string; option_values: Record<string, string>
    }>(
      `SELECT v.product_id, v.business_id, l.channel_id AS store_id,
              ${effectivePriceSql('v')}::bigint::text AS price, v.price_currency AS currency,
              p.title, v.option_values
       FROM product_variants v
       JOIN products p ON p.id = v.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
       JOIN listings l ON l.product_id = v.product_id AND l.status = 'published'
       JOIN stores s ON s.id = l.channel_id AND s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL
       WHERE v.id = $1`, [variantId])
    const target = vis[0]
    if (!target) return null
    const optionLabelSeen = Object.values(target.option_values ?? {}).filter(Boolean).join(' · ') || null

    // find-or-create the active (buyer, store) cart — the C1 invariant's unique
    // partial index makes the race a conflict, and the conflict a retry-safe no-op
    const { rows: carts } = await client.query<{ id: string }>(
      `SELECT id FROM carts WHERE buyer_kind = 'visitor' AND buyer_id = $1 AND store_id = $2 AND status = 'active'`,
      [visitorId, target.store_id])
    let cartId = carts[0]?.id
    if (!cartId) {
      cartId = uuidv7()
      await client.query(
        `INSERT INTO carts (id, buyer_kind, buyer_id, business_id, store_id) VALUES ($1, 'visitor', $2, $3, $4)`,
        [cartId, visitorId, target.business_id, target.store_id])
    }

    if (quantity <= 0) {
      await client.query(`DELETE FROM cart_lines WHERE cart_id = $1 AND variant_id = $2`, [cartId, variantId])
    } else {
      const { rows: count } = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM cart_lines WHERE cart_id = $1 AND variant_id <> $2`, [cartId, variantId])
      if ((count[0]?.n ?? 0) >= MAX_LINES) return { cartId, lines: count[0]!.n } // full — the read renders honestly
      await client.query(
        `INSERT INTO cart_lines (cart_id, variant_id, product_id, quantity, title_seen, option_label_seen, price_seen_minor, currency_seen)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
        [cartId, variantId, target.product_id, Math.min(quantity, 99), target.title, optionLabelSeen, target.price, target.currency])
    }
    await client.query(`UPDATE carts SET updated_at = now() WHERE id = $1`, [cartId])
    const { rows: n } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM cart_lines WHERE cart_id = $1`, [cartId])
    return { cartId, lines: n[0]?.n ?? 0 }
  }

  /** All active carts for a buyer, grouped by store, re-quoted on this read (C2). */
  async listForBuyer(tx: Tx, visitorId: string): Promise<CartView[]> {
    const client = asClient(tx)
    const { rows } = await client.query<{
      cart_id: string; store_handle: string; store_name: string; updated_at: string
      variant_id: string; product_id: string; product_title: string; option_values: Record<string, string>
      quantity: number; price_seen_minor: string | null; currency_seen: string | null
      live_price: string | null; live_currency: string | null; available: boolean
      image_url: string | null; image_alt: string | null
    }>(
      `SELECT c.id AS cart_id, s.handle AS store_handle, s.name AS store_name, c.updated_at::text AS updated_at,
              cl.variant_id, cl.product_id,
              COALESCE(p.title, cl.title_seen) AS product_title,
              COALESCE(v.option_values, '{}'::jsonb) AS option_values, cl.option_label_seen,
              cl.quantity, cl.price_seen_minor::text AS price_seen_minor, cl.currency_seen,
              ${effectivePriceSql('v')}::text AS live_price, v.price_currency AS live_currency,
              (v.id IS NOT NULL AND p.id IS NOT NULL
               AND p.status <> 'archived' AND p.deleted_at IS NULL
               AND s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL
               AND EXISTS (SELECT 1 FROM listings l WHERE l.product_id = cl.product_id
                           AND l.channel_id = c.store_id AND l.status = 'published')) AS available,
              img.url AS image_url, img.alt_text AS image_alt
       FROM carts c
       JOIN stores s ON s.id = c.store_id
       JOIN cart_lines cl ON cl.cart_id = c.id
       LEFT JOIN product_variants v ON v.id = cl.variant_id
       LEFT JOIN products p ON p.id = cl.product_id
       LEFT JOIN LATERAL (
         SELECT ma.url, pm.alt_text FROM product_media pm
         JOIN media_assets ma ON ma.id = pm.media_id
         WHERE pm.product_id = cl.product_id
         ORDER BY (pm.role = 'hero') DESC, pm.position ASC LIMIT 1
       ) img ON true
       WHERE c.buyer_kind = 'visitor' AND c.buyer_id = $1 AND c.status = 'active'
       ORDER BY c.updated_at DESC, cl.added_at ASC`, [visitorId])

    const byCart = new Map<string, CartView>()
    for (const r of rows) {
      let view = byCart.get(r.cart_id)
      if (!view) {
        view = { cart_id: r.cart_id, store_handle: r.store_handle, store_name: r.store_name, lines: [], subtotal_minor: 0, currency: null, updated_at: r.updated_at }
        byCart.set(r.cart_id, view)
      }
      const price = r.available && r.live_price !== null ? Number(r.live_price) : null
      const optionLabel = Object.values(r.option_values ?? {}).filter(Boolean).join(' · ') || null
      view.lines.push({
        variant_id: r.variant_id, product_id: r.product_id, product_title: r.product_title,
        option_label: optionLabel, quantity: r.quantity,
        price_minor: price, currency: r.live_currency,
        price_seen_minor: r.price_seen_minor === null ? null : Number(r.price_seen_minor),
        available: r.available, image_url: r.image_url, image_alt: r.image_alt,
      })
      if (price !== null) {
        view.subtotal_minor += price * r.quantity
        view.currency = view.currency ?? r.live_currency
      }
    }
    return [...byCart.values()]
  }

  /**
   * Merge-on-login (blueprint §5.1): line-union from the device's pre-login visitor
   * into the claimed visitor — quantities MAX, never summed (refresh-safety); the
   * source cart is marked merged. Idempotent: an empty or absent source is a no-op.
   */
  async mergeVisitors(tx: Tx, fromVisitorId: string, intoVisitorId: string): Promise<void> {
    if (fromVisitorId === intoVisitorId) return
    const client = asClient(tx)
    const { rows: sources } = await client.query<{ id: string; store_id: string; business_id: string }>(
      `SELECT id, store_id, business_id FROM carts WHERE buyer_kind = 'visitor' AND buyer_id = $1 AND status = 'active'`,
      [fromVisitorId])
    for (const source of sources) {
      const { rows: targets } = await client.query<{ id: string }>(
        `SELECT id FROM carts WHERE buyer_kind = 'visitor' AND buyer_id = $1 AND store_id = $2 AND status = 'active'`,
        [intoVisitorId, source.store_id])
      let targetId = targets[0]?.id
      if (!targetId) {
        targetId = uuidv7()
        await client.query(
          `INSERT INTO carts (id, buyer_kind, buyer_id, business_id, store_id) VALUES ($1, 'visitor', $2, $3, $4)`,
          [targetId, intoVisitorId, source.business_id, source.store_id])
      }
      await client.query(
        `INSERT INTO cart_lines (cart_id, variant_id, product_id, quantity, price_seen_minor, currency_seen)
         SELECT $1, variant_id, product_id, quantity, price_seen_minor, currency_seen FROM cart_lines WHERE cart_id = $2
         ON CONFLICT (cart_id, variant_id)
         DO UPDATE SET quantity = GREATEST(cart_lines.quantity, EXCLUDED.quantity)`,
        [targetId, source.id])
      await client.query(`UPDATE carts SET status = 'merged', updated_at = now() WHERE id = $1`, [source.id])
      await client.query(`UPDATE carts SET updated_at = now() WHERE id = $1`, [targetId])
    }
  }

  /**
   * PRR-M1: the manifest's retention promise, kept — terminal carts (merged or
   * abandoned) purge after 90 quiet days, lines first (no CASCADE by law).
   */
  async purgeTerminal(tx: Tx, now = new Date()): Promise<number> {
    const client = asClient(tx)
    const cutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString()
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM carts WHERE status IN ('merged','abandoned') AND updated_at < $1 LIMIT 200`, [cutoff])
    for (const cart of rows) {
      await client.query(`DELETE FROM cart_lines WHERE cart_id = $1`, [cart.id])
      await client.query(`DELETE FROM carts WHERE id = $1`, [cart.id])
    }
    return rows.length
  }

  /**
   * The abandonment clock (§5.2): 30 quiet days → `orders.cart.abandoned` (frozen
   * taxonomy; payload carries refs, no lines — DOMAIN_EVENTS.md) and the cart leaves
   * the active set. Idempotent by construction: the status flip and the event land
   * in one transaction, and flipped carts never match again.
   */
  async sweepAbandoned(tx: Tx, now = new Date()): Promise<number> {
    const client = asClient(tx)
    const cutoff = new Date(now.getTime() - ABANDON_AFTER_DAYS * 86_400_000)
    const { rows } = await client.query<{ id: string; business_id: string; store_id: string; buyer_id: string }>(
      `UPDATE carts SET status = 'abandoned'
       WHERE status = 'active' AND updated_at < $1
         AND EXISTS (SELECT 1 FROM cart_lines cl WHERE cl.cart_id = carts.id)
       RETURNING id, business_id, store_id, buyer_id`, [cutoff.toISOString()])
    for (const cart of rows) {
      await this.events.append(tx, [{
        businessId: cart.business_id,
        aggregate: { type: 'cart', id: cart.id },
        eventType: 'orders.cart.abandoned',
        schemaVersion: 1,
        payload: { cart_id: cart.id, store_id: cart.store_id },
        actor: { type: 'system', id: 'cart-abandonment-sweep' },
      }])
    }
    return rows.length
  }
}
