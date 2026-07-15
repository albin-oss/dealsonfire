/**
 * Contract-first schema: GET /api/v1/public/stores/:handle (UX-IGNITE Phase 3).
 * The public face of a LIVE store — the only unauthenticated read surface so far.
 * Draft/paused/held/unknown handles are indistinguishable (404 masking, no enumeration).
 */
import { z } from 'zod'

export const publicStorefrontResponse = z.object({
  store: z.object({
    handle: z.string(),
    name: z.string(),
    published_at: z.string().nullable(),
  }),
  brand: z.object({
    name: z.string(),
    palette: z.record(z.string(), z.string()),
    tagline: z.string().nullable(),
  }).nullable(),
  products: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    price_minor: z.number().int().nullable(),
    currency: z.string().nullable(),
  })),
})
export type PublicStorefrontResponse = z.infer<typeof publicStorefrontResponse>

/** GET /api/v1/public/stores/:handle/products/:productId — one visible product. */
export const publicProductResponse = z.object({
  store: z.object({ handle: z.string(), name: z.string() }),
  brand: z.object({
    name: z.string(),
    palette: z.record(z.string(), z.string()),
    tagline: z.string().nullable(),
  }).nullable(),
  product: z.object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string().nullable(),
    price_minor: z.number().int().nullable(),
    currency: z.string().nullable(),
  }),
})
export type PublicProductResponse = z.infer<typeof publicProductResponse>
