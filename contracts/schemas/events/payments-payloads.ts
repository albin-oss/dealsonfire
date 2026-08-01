/**
 * Payments event payload schemas (M-6; registered with the sprints that first
 * emitted them — C4/C5). Amount-bearing in minor units; refs only, PII-free.
 */
import { z } from 'zod'
import type { PayloadValidator } from '@shared/validation'

const uuid = z.string().uuid()

const moneyFact = z.object({
  intent_id: uuid,
  amount_minor: z.number().int().nonnegative(),
  currency: z.string().length(3),
}).passthrough()

export const PAYMENTS_EVENT_PAYLOADS: Record<string, z.ZodTypeAny> = {
  'payments.authorization.succeeded': moneyFact,
  'payments.authorization.failed': moneyFact,
  'payments.charge.succeeded': moneyFact.and(z.object({ order_id: uuid }).passthrough()),
  'payments.hold.opened': moneyFact.and(z.object({ order_id: uuid }).passthrough()),
  // C6: money back (frozen taxonomy name) + the hold release on fulfillment evidence
  'payments.refund.issued': moneyFact.and(z.object({ order_id: uuid, cause_key: z.string() }).passthrough()),
  'payments.hold.released': moneyFact.and(z.object({ order_id: uuid }).passthrough()),
  // C10 Slice 3: the connected account's capabilities changed (Connect truth)
  'payments.account.updated': z.object({
    business_id: uuid,
    charges_enabled: z.boolean(),
    payouts_enabled: z.boolean(),
    disabled_reason: z.string().nullable(),
  }).passthrough(),
}

export function paymentsPayloadValidators(): Record<string, PayloadValidator> {
  return Object.fromEntries(
    Object.entries(PAYMENTS_EVENT_PAYLOADS).map(([eventType, schema]) => [
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
