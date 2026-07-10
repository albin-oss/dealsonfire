/**
 * Contract-first schemas: POST /api/v1/businesses (BLUEPRINT §4).
 * Single definition — server parses with it, clients infer DTO types from it.
 */
import { z } from 'zod'

export const createBusinessRequest = z.object({
  display_name: z.string().trim().min(1).max(120),
  business_type: z.enum(['individual', 'registered']),
}).strict()
export type CreateBusinessRequest = z.infer<typeof createBusinessRequest>

export const businessSummaryResponse = z.object({
  business_id: z.string().uuid(),
  membership_id: z.string().uuid(),
  merchant_id: z.string().uuid(),
  display_name: z.string(),
  business_type: z.enum(['individual', 'registered']),
  trust_level: z.enum(['unverified', 'identity_verified', 'business_verified', 'banking_verified']),
  scale_tier: z.enum(['starter', 'growth', 'established', 'enterprise']),
  standing: z.enum(['good', 'flagged', 'restricted', 'suspended', 'banned']),
})
export type BusinessSummaryResponse = z.infer<typeof businessSummaryResponse>
