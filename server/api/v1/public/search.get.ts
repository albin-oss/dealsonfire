/**
 * GET /api/v1/public/search?q=&scope=&page= (LS-2) — ask the street.
 * scope=all (default): top results per group for the dropdown and the /search
 * landing. A single scope pages deeper (24/page, bounded). Relevance is
 * explainable (name > said-about > story; freshness ties) — never popularity.
 */
import { z } from 'zod'
import { getQuery, setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../utils/define-public-endpoint'
import { getContainer } from '../../../utils/container'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'
import type { StreetSearchResults, SearchScope } from '../../../utils/street-search'

const SCOPES: SearchScope[] = ['all', 'shops', 'products', 'deals', 'sparks']

export default definePublicEndpoint({
  name: 'public.search',
  schema: z.object({}),
  rateLimit: { limit: 120, windowSeconds: 60 },
  async handler({ event }): Promise<Result<StreetSearchResults & { q: string; scope: SearchScope; page: number }, DomainError>> {
    const raw = getQuery(event)
    const q = String(raw.q ?? '').trim()
    if (q.length < 2 || q.length > 80) {
      return err(domainError('VALIDATION_FAILED', 'search needs 2–80 characters'))
    }
    const scope = SCOPES.includes(raw.scope as SearchScope) ? (raw.scope as SearchScope) : 'all'
    const page = Math.min(Math.max(Number.parseInt(String(raw.page ?? '1'), 10) || 1, 1), 8)
    const results = await getContainer().engagement.searchStreet(q, { scope, page })
    setResponseHeader(event, 'Cache-Control', 'public, max-age=15, s-maxage=30')
    return ok({ q, scope, page, ...results })
  },
})
