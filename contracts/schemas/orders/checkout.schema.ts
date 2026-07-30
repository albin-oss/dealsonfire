/**
 * Contract-first schemas: the public checkout + order surface (Commerce Foundation C3;
 * ADR-007 §5). One request runs the resumable saga — the attempt key is client-minted
 * and survives refreshes, double-clicks, and dead networks (A7-2).
 */
import { z } from 'zod'

export const checkoutRequest = z.object({
  /** Client-minted uuid, held in sessionStorage — the idempotency spine. */
  attempt_key: z.string().uuid(),
  cart_id: z.string().uuid(),
  contact: z.object({
    name: z.string().min(1).max(120),
    email: z.string().email().max(254),
  }),
  delivery: z.object({
    line1: z.string().min(1).max(200),
    city: z.string().min(1).max(120),
    postal_code: z.string().min(1).max(20),
    country: z.string().length(2),
  }).optional(),
  /** C6: ship (default) or pickup where the store allows it; digital resolves itself. */
  method: z.enum(['ship', 'pickup']).optional(),
}).superRefine((body, ctx) => {
  // pickup needs no address; shipping does (DeliverySnapshot = address OR pickup marker)
  if (body.method !== 'pickup' && !body.delivery) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['delivery'], message: 'a delivery address is required for shipped orders' })
  }
})
export type CheckoutRequest = z.infer<typeof checkoutRequest>

export const checkoutResponse = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), order_id: z.string().uuid(), order_number: z.string() }),
  z.object({
    ok: z.literal(false),
    code: z.enum(['CART_CHANGED', 'OUT_OF_STOCK', 'PAYMENT_DECLINED', 'ATTEMPT_FAILED']),
    detail: z.string(),
  }),
])
export type CheckoutResponse = z.infer<typeof checkoutResponse>

const orderLine = z.object({
  line_no: z.number().int(),
  title: z.string(),
  option_label: z.string().nullable(),
  unit_price_minor: z.number().int(),
  quantity: z.number().int(),
  line_state: z.string(),
  product_id: z.string().uuid(),
  image_url: z.string().nullable(),
})

export const buyerOrderResponse = z.object({
  order: z.object({
    id: z.string().uuid(),
    order_number: z.string(),
    state: z.string(),
    placed_at: z.string(),
    store_handle: z.string(),
    store_name: z.string(),
    subtotal_minor: z.number().int(),
    shipping_minor: z.number().int(),
    total_minor: z.number().int(),
    currency: z.string(),
    contact_name: z.string(),
    delivery: z.object({ line1: z.string(), city: z.string(), postal_code: z.string(), country: z.string() }),
    /** C6: the promise snapshot + how it travels. */
    promise_ship_by: z.string().nullable(),
    delivery_method: z.string(),
    cancel_requested: z.boolean(),
  }),
  lines: z.array(orderLine),
  timeline: z.array(z.object({
    entry_type: z.string(),
    message: z.record(z.string(), z.unknown()),
    occurred_at: z.string(),
  })),
  /** C6 — the Workshop Wait: the maker's public sparks from the wait window. */
  wait_sparks: z.array(z.object({
    id: z.string().uuid(),
    body: z.string(),
    published_at: z.string(),
    image_url: z.string().nullable(),
  })),
  /** The maker's standing sign-off (their brand promise line), when one exists. */
  maker_promise: z.string().nullable(),
})
export type BuyerOrderResponse = z.infer<typeof buyerOrderResponse>

export const buyerOrdersResponse = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    order_number: z.string(),
    state: z.string(),
    placed_at: z.string(),
    store_handle: z.string(),
    store_name: z.string(),
    total_minor: z.number().int(),
    currency: z.string(),
    line_count: z.number().int(),
  })),
})
export type BuyerOrdersResponse = z.infer<typeof buyerOrdersResponse>
