/**
 * Contract-first schemas: GET /api/v1/workspace (BLUEPRINT §4).
 */
import { z } from 'zod'

export const workspaceOverviewResponse = z.object({
  merchant: z.object({
    merchant_id: z.string().uuid(),
    display_name: z.string(),
  }).nullable(),
  businesses: z.array(z.object({
    business_id: z.string().uuid(),
    display_name: z.string(),
    business_type: z.string(),
    trust_level: z.string(),
    scale_tier: z.string(),
    standing: z.string(),
    membership: z.object({
      membership_id: z.string().uuid(),
      roles: z.array(z.string()),
      store_scope: z.array(z.string().uuid()).nullable(),
    }),
    capabilities: z.array(z.string()),
    stores: z.array(z.object({
      store_id: z.string().uuid(),
      handle: z.string(),
      name: z.string(),
      status: z.string(),
      enforcement_hold: z.string(),
      completion_score: z.number(),
      published_at: z.string().nullable(),
    })),
  })),
})
export type WorkspaceOverviewResponse = z.infer<typeof workspaceOverviewResponse>
