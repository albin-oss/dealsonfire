/**
 * Operations event payload schemas (M-6; CDC-001 D3: producer-owned, registry-locked).
 * OPS-001 Batch 1 registers EXACTLY the three location events — future events register
 * with the sprint that first emits them. passthrough(): consumers tolerate unknown
 * fields (ADR-003 §4 additive evolution).
 */
import { z } from 'zod'
import type { PayloadValidator } from '@shared/validation'

const uuid = z.string().uuid()
const LOCATION_KINDS = ['home', 'store', 'warehouse', 'fulfillment_center', 'partner', 'temporary', 'popup'] as const

export const OPERATIONS_EVENT_PAYLOADS: Record<string, z.ZodTypeAny> = {
  'operations.location.created': z.object({
    location_id: uuid,
    business_id: uuid,
    kind: z.enum(LOCATION_KINDS),
    name: z.string().min(1).max(80),
    is_default: z.boolean(),
    ghost: z.boolean(),
  }).passthrough(),
  'operations.location.updated': z.object({
    location_id: uuid,
    business_id: uuid,
    fields_changed: z.array(z.string()).min(1),
  }).passthrough(),
  'operations.location.closed': z.object({
    location_id: uuid,
    business_id: uuid,
  }).passthrough(),
}

export function operationsPayloadValidators(): Record<string, PayloadValidator> {
  return Object.fromEntries(
    Object.entries(OPERATIONS_EVENT_PAYLOADS).map(([eventType, schema]) => [
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
