/**
 * GET /api/v1/public/street (LS-4) — the street voice: a SHARED pulse of what
 * is worth noticing right now. Not personalization: everyone sees
 * substantially the same street. mode:'chronology' tells the client to render
 * the Newest stream instead (fallback law — the street never fails closed).
 */
import { z } from 'zod'
import { setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../utils/define-public-endpoint'
import { getContainer } from '../../../utils/container'
import type { StreetFeed } from '../../../utils/street-pulse'
import { ok, type Result } from '@shared/result'
import { type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'public.street',
  schema: z.object({}),
  rateLimit: { limit: 120, windowSeconds: 60 },
  async handler({ event }): Promise<Result<StreetFeed, DomainError>> {
    const feed = await getContainer().engagement.streetFeed()
    // shared (not per-visitor) — shared-cacheable for a short breath
    setResponseHeader(event, 'Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=120')
    return ok(feed)
  },
})
