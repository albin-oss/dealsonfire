/**
 * Kernel event payload schemas (REVIEW-001 M-6): validated at the dispatcher boundary
 * BEFORE any consumer runs. A payload failing its own contract can never become valid,
 * so it dead-letters immediately instead of burning retries. Schemas use passthrough() —
 * consumers must tolerate unknown fields (ADR-001 §5.5); validation guards shape, not breadth.
 * This is the pattern every future module's consumers copy.
 */
import { z } from 'zod'
import type { PayloadValidator } from '@shared/validation'

const uuid = z.string().uuid()
const trustLevel = z.enum(['unverified', 'identity_verified', 'business_verified', 'banking_verified'])
const scaleTier = z.enum(['starter', 'growth', 'established', 'enterprise'])
const standing = z.enum(['good', 'flagged', 'restricted', 'suspended', 'banned'])

export const KERNEL_EVENT_PAYLOADS: Record<string, z.ZodTypeAny> = {
  'merchant.onboarded': z.object({ merchant_id: uuid, user_id: uuid, source: z.enum(['ignite', 'direct']) }).passthrough(),
  'merchant.business.created': z.object({ business_id: uuid, business_type: z.string(), scale_tier: scaleTier, trust_level: trustLevel }).passthrough(),
  'merchant.business.standing_changed': z.object({ business_id: uuid, from: standing, to: standing, reason_code: z.string() }).passthrough(),
  'merchant.business.trust_level_raised': z.object({ business_id: uuid, from: trustLevel, to: trustLevel }).passthrough(),
  'merchant.store.created': z.object({ store_id: uuid, business_id: uuid, handle: z.string(), name: z.string() }).passthrough(),
  'merchant.store.published': z.object({
    store_id: uuid, business_id: uuid, handle: z.string(), name: z.string(),
    brand_kit: z.object({ name: z.string(), palette: z.record(z.string(), z.string()) }).nullable(),
  }).passthrough(),
  'merchant.store.resumed': z.object({ store_id: uuid, business_id: uuid, handle: z.string(), name: z.string() }).passthrough(),
  'merchant.store.brand_kit_updated': z.object({ store_id: uuid, business_id: uuid, name: z.string() }).passthrough(),
  'merchant.store.enforcement_hold_changed': z.object({ store_id: uuid, business_id: uuid, from: z.string(), to: z.string(), reason_code: z.string() }).passthrough(),
  'merchant.staff.joined': z.object({ membership_id: uuid, business_id: uuid, principal_type: z.string(), principal_id: uuid, roles: z.array(z.string()) }).passthrough(),
}

/** Adapt zod schemas to the framework-free PayloadValidator port. */
export function kernelPayloadValidators(): Record<string, PayloadValidator> {
  return Object.fromEntries(
    Object.entries(KERNEL_EVENT_PAYLOADS).map(([eventType, schema]) => [
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
