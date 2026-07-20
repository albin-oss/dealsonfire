/**
 * GET /api/v1/public/home (Release 0.7) — the living Home stream: deals and sparks in
 * one chronological blend (recency IS the product; no ranking, no personalization).
 * Manages the last-visit watermark (cookie-only, on the visitor identity) and answers
 * "what have the stores I care about done since I was here?" via is_new flags and the
 * Following badge count. Per-visitor → private, never shared-cacheable.
 */
import { z } from 'zod'
import { getQuery, setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../utils/define-public-endpoint'
import { getContainer } from '../../../utils/container'
import { getVisitorId, observeHomeVisit } from '../../../utils/visitor'
import type { HomeFeedItem, FeedFilter } from '../../../utils/deals-feed'
import { ok, type Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export interface HomeResponse {
  items: HomeFeedItem[]
  has_identity: boolean
  last_visit: string | null
  new_following_count: number
  /** Release 1.0 — the visitor's merchants: the follow data as a visible possession. */
  my_merchants: Array<{ handle: string; name: string; tagline: string | null }>
  /** Release 1.3 — is this corner already kept (claimed to an identity)? */
  corner_kept: boolean
}

export default definePublicEndpoint({
  name: 'public.home',
  schema: z.object({}),
  rateLimit: { limit: 120, windowSeconds: 60 },
  async handler({ event }): Promise<Result<HomeResponse, DomainError>> {
    const raw = String(getQuery(event).filter ?? 'all')
    const filter: FeedFilter = raw === 'saved' || raw === 'following' ? raw : 'all'
    const visitorId = getVisitorId(event)
    const { lastVisit } = observeHomeVisit(event)
    const result = await getContainer().engagement.homeFeed(visitorId, filter, lastVisit)
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return ok({
      items: result.items,
      has_identity: visitorId !== null,
      last_visit: lastVisit,
      new_following_count: result.newFollowingCount,
      my_merchants: result.myMerchants,
      corner_kept: result.cornerKept,
    })
  },
})
