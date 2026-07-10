/**
 * Commerce event payload schemas (BLUEPRINT-002 §5, M-6 pattern). Registered NOW — before
 * any dispatcher exists for commerce — so validation covers the first event ever emitted
 * (the persistence sprint wires these into the commerce dispatcher instance verbatim).
 * passthrough(): consumers must tolerate unknown fields (ADR-003 §4).
 */
import { z } from 'zod'
import type { PayloadValidator } from '@shared/validation'

const uuid = z.string().uuid()
const money = z.object({ amount: z.number().int().nonnegative(), currency: z.string().length(3) }).passthrough()

export const COMMERCE_EVENT_PAYLOADS: Record<string, z.ZodTypeAny> = {
  'commerce.product.created': z.object({
    product_id: uuid, business_id: uuid, title: z.string().min(1),
    fulfillment_kind: z.enum(['physical', 'digital', 'service']),
    category_path: z.string().nullable(), status: z.enum(['draft', 'active', 'archived']),
    variant_count: z.number().int().positive(), source: z.enum(['manual', 'draft']),
  }).passthrough(),
  'commerce.product.updated': z.object({
    product_id: uuid, business_id: uuid,
    fields_changed: z.array(z.string()).min(1), status: z.enum(['draft', 'active', 'archived']),
  }).passthrough(),
  'commerce.product.archived': z.object({ product_id: uuid, business_id: uuid }).passthrough(),
  'commerce.variant.added': z.object({
    product_id: uuid, business_id: uuid, variant_id: uuid,
    sku: z.string().min(1), option_values: z.record(z.string(), z.string()),
  }).passthrough(),
  'commerce.variant.updated': z.object({
    product_id: uuid, business_id: uuid, variant_id: uuid, fields_changed: z.array(z.string()).min(1),
  }).passthrough(),
  'commerce.variant.price_changed': z.object({
    product_id: uuid, business_id: uuid, variant_id: uuid,
    old_price: money, new_price: money, sale_active: z.boolean(), source: z.enum(['manual', 'schedule']),
  }).passthrough(),
  'commerce.product.media_added': z.object({
    product_id: uuid, business_id: uuid, product_media_id: uuid, media_id: uuid,
    variant_id: uuid.nullable(), role: z.enum(['gallery', 'hero', 'swatch']),
  }).passthrough(),
  'commerce.product.media_removed': z.object({
    product_id: uuid, business_id: uuid, product_media_id: uuid, media_id: uuid,
  }).passthrough(),
}

export function commercePayloadValidators(): Record<string, PayloadValidator> {
  return Object.fromEntries(
    Object.entries(COMMERCE_EVENT_PAYLOADS).map(([eventType, schema]) => [
      eventType,
      ((payload: unknown) => {
        const parsed = schema.safeParse(payload)
        return parsed.success
          ? { ok: true as const }
          : { ok: false as const, message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
      }) as PayloadValidator,
    ]),
  )
}
