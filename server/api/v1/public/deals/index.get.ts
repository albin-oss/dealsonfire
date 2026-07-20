/**
 * GET /api/v1/public/deals (Release 0.4) — the discovery feed. Chronological recency
 * across every live store (full visibility conjunction per row). Carries per-visitor
 * flags when an identity cookie exists → private, never shared-cacheable.
 */
import { z } from 'zod'
import { getQuery, setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../utils/container'
import { getVisitorId } from '../../../../utils/visitor'
import type { FeedDeal, FeedFilter } from '../../../../utils/deals-feed'
import { ok, type Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'public.deals-feed',
  schema: z.object({}),
  rateLimit: { limit: 120, windowSeconds: 60 },
  async handler({ event }): Promise<Result<{ items: FeedDeal[]; has_identity: boolean }, DomainError>> {
    const raw = String(getQuery(event).filter ?? 'all')
    const filter: FeedFilter = raw === 'saved' || raw === 'following' ? raw : 'all'
    const visitorId = getVisitorId(event)
    const items = await getContainer().engagement.dealsFeed(visitorId, filter)
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return ok({ items, has_identity: visitorId !== null })
  },
})
