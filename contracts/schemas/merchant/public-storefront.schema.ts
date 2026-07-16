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
    story: z.string().nullable(),
    promise: z.string().nullable(),
  }).nullable(),
  products: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    price_minor: z.number().int().nullable(),
    currency: z.string().nullable(),
    image_url: z.string().nullable(),
    image_alt: z.string().nullable(),
  })),
  /** Latest sparks (Release 0.6) — the store's voice, newest first. */
  sparks: z.array(z.object({
    id: z.string().uuid(),
    body: z.string(),
    published_at: z.string(),
    image_url: z.string().nullable(),
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
    story: z.string().nullable(),
    promise: z.string().nullable(),
  }).nullable(),
  product: z.object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string().nullable(),
    price_minor: z.number().int().nullable(),
    currency: z.string().nullable(),
    image_url: z.string().nullable(),
    image_alt: z.string().nullable(),
  }),
})
export type PublicProductResponse = z.infer<typeof publicProductResponse>

/** GET /api/v1/public/stores/:handle/deals/:dealId — one visible deal (Release 0.3). */
export const publicDealResponse = z.object({
  store: z.object({ handle: z.string(), name: z.string() }),
  brand: z.object({
    name: z.string(),
    palette: z.record(z.string(), z.string()),
    tagline: z.string().nullable(),
    story: z.string().nullable(),
    promise: z.string().nullable(),
  }).nullable(),
  deal: z.object({
    id: z.string().uuid(),
    headline: z.string(),
    story: z.string().nullable(),
    published_at: z.string(),
  }),
  product: z.object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string().nullable(),
    price_minor: z.number().int().nullable(),
    currency: z.string().nullable(),
    image_url: z.string().nullable(),
    image_alt: z.string().nullable(),
  }),
})
export type PublicDealResponse = z.infer<typeof publicDealResponse>

/** GET /api/v1/public/stores/:handle/sparks/:sparkId — one visible spark (Release 0.6). */
export const publicSparkResponse = z.object({
  store: z.object({ handle: z.string(), name: z.string() }),
  brand: z.object({
    name: z.string(),
    palette: z.record(z.string(), z.string()),
    tagline: z.string().nullable(),
    story: z.string().nullable(),
    promise: z.string().nullable(),
  }).nullable(),
  spark: z.object({
    id: z.string().uuid(),
    body: z.string(),
    published_at: z.string(),
    image_url: z.string().nullable(),
  }),
  /** The product card rides only while the product is visible; null otherwise. */
  product: z.object({
    id: z.string().uuid(),
    title: z.string(),
    price_minor: z.number().int().nullable(),
    currency: z.string().nullable(),
    image_url: z.string().nullable(),
    image_alt: z.string().nullable(),
  }).nullable(),
})
export type PublicSparkResponse = z.infer<typeof publicSparkResponse>
