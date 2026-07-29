/**
 * Orders event payload schemas (M-6; registered with the sprints that first
 * emitted them — C1/C3/C5). passthrough(): consumers tolerate unknown fields
 * (ADR-003 §4 additive evolution). PII-free by law: refs only, never contact
 * or address snapshots.
 */
import { z } from 'zod'
import type { PayloadValidator } from '@shared/validation'

const uuid = z.string().uuid()

export const ORDERS_EVENT_PAYLOADS: Record<string, z.ZodTypeAny> = {
  'orders.cart.abandoned': z.object({
    cart_id: uuid,
    store_id: uuid,
  }).passthrough(),
  'orders.order.placed': z.object({
    order_id: uuid,
    business_id: uuid,
    store_id: uuid,
    total_minor: z.number().int().nonnegative(),
    currency: z.string().length(3),
    line_count: z.number().int().positive(),
  }).passthrough(),
  'orders.order.confirmed': z.object({
    order_id: uuid,
    business_id: uuid,
    store_id: uuid,
    total_minor: z.number().int().nonnegative(),
    currency: z.string().length(3),
    fallen_lines: z.number().int().nonnegative(),
  }).passthrough(),
  'orders.order.cancelled': z.object({
    order_id: uuid,
    business_id: uuid,
    store_id: uuid,
    reason: z.string(),
  }).passthrough(),
  // C7: aging stage 2 — registered with the sprint that first emits it (M-6)
  'orders.order.promise_missed': z.object({
    order_id: uuid,
    business_id: uuid,
    store_id: uuid,
  }).passthrough(),
  // C8: the cancellation request (the bench decides)
  'orders.order.cancel_requested': z.object({
    order_id: uuid,
    business_id: uuid,
    store_id: uuid,
  }).passthrough(),
}

export function ordersPayloadValidators(): Record<string, PayloadValidator> {
  return Object.fromEntries(
    Object.entries(ORDERS_EVENT_PAYLOADS).map(([eventType, schema]) => [
      eventType,
      ((payload: unknown) => {
        const parsed = schema.safeParse(payload)
        return parsed.success
          ? { ok: true as const }
          : { ok: false as const, reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
      }) as PayloadValidator,
    ]),
  )
}
