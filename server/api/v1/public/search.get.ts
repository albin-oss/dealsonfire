/** GET /api/v1/public/search?q= (Increment 08) — grouped street search, found not ranked. */
import { z } from 'zod'
import { getQuery, setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../utils/define-public-endpoint'
import { getContainer } from '../../../utils/container'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'
import type { SearchResults } from '../../../utils/deals-feed'

export default definePublicEndpoint({
  name: 'public.search',
  schema: z.object({}),
  rateLimit: { limit: 120, windowSeconds: 60 },
  async handler({ event }): Promise<Result<SearchResults & { q: string }, DomainError>> {
    const q = String(getQuery(event).q ?? '').trim()
    if (q.length < 2 || q.length > 80) {
      return err(domainError('VALIDATION_FAILED', 'search needs 2–80 characters'))
    }
    const results = await getContainer().engagement.searchStreet(q)
    setResponseHeader(event, 'Cache-Control', 'public, max-age=15, s-maxage=30')
    return ok({ q, ...results })
  },
})
