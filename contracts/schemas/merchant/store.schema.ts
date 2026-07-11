/**
 * Contract-first schemas: store creation + publish (BLUEPRINT §4).
 */
import { z } from 'zod'

export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/

export const createStoreRequest = z.object({
  name: z.string().trim().min(1).max(80),
  handle: z.string().regex(HANDLE_PATTERN, 'invalid handle format').optional(),
}).strict()
export type CreateStoreRequest = z.infer<typeof createStoreRequest>

/** GET /handles/:handle/availability — real-time Ignite handle selection. */
export const handleAvailabilityResponse = z.object({
  handle: z.string(),
  available: z.boolean(),
  reason: z.enum(['ok', 'invalid_format', 'taken']),
  suggestions: z.array(z.string()),
})
export type HandleAvailabilityResponse = z.infer<typeof handleAvailabilityResponse>

export const storeResponse = z.object({
  store_id: z.string().uuid(),
  business_id: z.string().uuid(),
  handle: z.string(),
  name: z.string(),
  status: z.enum(['draft', 'live', 'paused', 'archived', 'closed', 'deleted']),
  enforcement_hold: z.enum(['none', 'under_review', 'suspended']),
})
export type StoreResponse = z.infer<typeof storeResponse>

export const publishStoreRequest = z.object({}).strict()

export const publishStoreResponse = z.object({
  store_id: z.string().uuid(),
  status: z.literal('live'),
  published_at: z.string().datetime(),
  store_url: z.string(),
})
export type PublishStoreResponse = z.infer<typeof publishStoreResponse>
