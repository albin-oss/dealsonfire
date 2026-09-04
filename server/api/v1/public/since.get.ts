/**
 * GET /api/v1/public/since (LS-6) — "since you were here": what changed at the
 * shops this visitor follows, since their last session. Reads the watermark
 * read-only (never advances it — refresh-safe), derives purely from follows +
 * publication time + the visibility law. Per-visitor → private, never cached.
 * An all-empty return is honest: the client falls through to the Street.
 */
import { z } from 'zod'
import { setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../utils/define-public-endpoint'
import { getContainer } from '../../../utils/container'
import { getVisitorId, readLastVisit } from '../../../utils/visitor'
import type { ReturnJourney } from '../../../utils/return-journey'
import { ok, type Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'public.since',
  schema: z.object({}),
  rateLimit: { limit: 120, windowSeconds: 60 },
  async handler({ event }): Promise<Result<ReturnJourney, DomainError>> {
    const visitorId = getVisitorId(event)
    const lastVisit = readLastVisit(event)
    const journey = await getContainer().engagement.returnJourney(visitorId, lastVisit)
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return ok(journey)
  },
})
