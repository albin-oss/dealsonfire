/**
 * Identity event payload schemas (M-6; WP-R1-B1). Registers EXACTLY the two emitted
 * events (emitted-only law). passthrough(): additive evolution (ADR-003 §4).
 */
import { z } from 'zod'
import type { PayloadValidator } from '@shared/validation'

const uuid = z.string().uuid()

export const IDENTITY_EVENT_PAYLOADS: Record<string, z.ZodTypeAny> = {
  'identity.user.registered': z.object({
    user_id: uuid,
    source: z.enum(['direct', 'ignite_claim']),
  }).passthrough(),
  'identity.session.revoked_all': z.object({
    user_id: uuid,
    kept_current: z.boolean(),
  }).passthrough(),
}

export function identityPayloadValidators(): Record<string, PayloadValidator> {
  return Object.fromEntries(
    Object.entries(IDENTITY_EVENT_PAYLOADS).map(([eventType, schema]) => [
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
