/**
 * GET /api/v1/public/stores/:handle (UX-IGNITE Phase 3) — the public storefront read.
 * Unauthenticated by design: this is what the world sees. LIVE stores only; draft, paused,
 * held, deleted, and unknown handles all answer the same 404 (no enumeration oracle).
 * Cacheable: the response is public data and changes only on publish/brand/product events.
 */
import { z } from 'zod'
import { getRouterParam, setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../utils/container'
import type { PublicStorefrontResponse } from '@contracts/schemas/merchant/public-storefront.schema'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

const HANDLE_SHAPE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/i

export default definePublicEndpoint({
  name: 'public.storefront',
  schema: z.object({}),
  rateLimit: { limit: 120, windowSeconds: 60 },
  async handler({ event }): Promise<Result<PublicStorefrontResponse, DomainError>> {
    const handle = (getRouterParam(event, 'handle') ?? '').toLowerCase()
    if (!HANDLE_SHAPE.test(handle)) {
      return err(domainError('NOT_FOUND', 'this store does not exist')) // malformed = same 404, no DB hit
    }
    const storefront = await getContainer().queries.publicStorefront(handle)
    if (!storefront) return err(domainError('NOT_FOUND', 'this store does not exist'))
    setResponseHeader(event, 'Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300')
    return ok(storefront)
  },
})
