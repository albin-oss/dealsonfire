/**
 * Contract-first schemas: PUT /api/v1/stores/:storeId/brand-kit (BLUEPRINT §4).
 * BrandKit is a VO — the contract is a whole-document PUT, never a PATCH.
 */
import { z } from 'zod'

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be #rrggbb')

export const brandKitUpdateRequest = z.object({
  name: z.string().trim().min(1).max(80),
  logo_media_id: z.string().uuid().nullable().optional(),
  palette: z.record(z.string().min(1).max(32), hexColor).optional(),
  typography: z.record(z.string().min(1).max(32), z.string().min(1).max(64)).optional(),
  voice: z.object({
    tone: z.string().max(200).optional(),
    keywords: z.array(z.string().max(40)).max(10).optional(),
    /** Release 0.5 — the identity loop: who they are, in their own words. */
    story: z.string().max(500).optional(),
    promise: z.string().max(120).optional(),
  }).strict().optional(),
}).strict()
export type BrandKitUpdateRequest = z.infer<typeof brandKitUpdateRequest>

export const brandKitResponse = z.object({
  store_id: z.string().uuid(),
  name: z.string(),
  logo_media_id: z.string().uuid().nullable(),
  palette: z.record(z.string(), z.string()),
  typography: z.record(z.string(), z.string()),
  voice: z.object({ tone: z.string().optional(), keywords: z.array(z.string()).optional(), story: z.string().optional(), promise: z.string().optional() }),
})
export type BrandKitResponse = z.infer<typeof brandKitResponse>
