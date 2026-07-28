/**
 * Contract-first schemas: the public cart surface (Commerce Foundation C1; ADR-007 §4).
 * The cart is a working document: lines are set to absolute quantities (0 removes) —
 * idempotent by (buyer, variant) natural key; reads re-quote every line against the
 * live visibility conjunction and say so honestly when reality moved.
 */
import { z } from 'zod'

export const setCartLineRequest = z.object({
  variant_id: z.string().uuid(),
  /** Absolute quantity — 0 removes the line. */
  quantity: z.number().int().min(0).max(99),
})
export type SetCartLineRequest = z.infer<typeof setCartLineRequest>

export const cartLineView = z.object({
  variant_id: z.string().uuid(),
  product_id: z.string().uuid(),
  product_title: z.string(),
  option_label: z.string().nullable(),
  quantity: z.number().int(),
  price_minor: z.number().int().nullable(),
  currency: z.string().nullable(),
  price_seen_minor: z.number().int().nullable(),
  available: z.boolean(),
  image_url: z.string().nullable(),
  image_alt: z.string().nullable(),
})

export const cartView = z.object({
  cart_id: z.string().uuid(),
  store_handle: z.string(),
  store_name: z.string(),
  lines: z.array(cartLineView),
  subtotal_minor: z.number().int(),
  currency: z.string().nullable(),
  updated_at: z.string(),
})
export type CartView = z.infer<typeof cartView>

export const cartsResponse = z.object({ carts: z.array(cartView) })
export type CartsResponse = z.infer<typeof cartsResponse>

export const setCartLineResponse = z.object({
  cart_id: z.string().uuid(),
  lines: z.number().int(),
})
export type SetCartLineResponse = z.infer<typeof setCartLineResponse>
