/**
 * GET /api/v1/public/stores/:handle/deals/:dealId (Release 0.3) — one deal, iff the deal
 * AND its product are visible (VISIBILITY_CONTRACT §1). Everything else: identical 404.
 */
import { z } from 'zod'
import { getRouterParam, setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../../../utils/container'
import type { PublicDealResponse } from '@contracts/schemas/merchant/public-storefront.schema'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

const HANDLE_SHAPE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/i

export default definePublicEndpoint({
  name: 'public.deal',
  schema: z.object({}),
  rateLimit: { limit: 240, windowSeconds: 60 },
  async handler({ event }): Promise<Result<PublicDealResponse, DomainError>> {
    const handle = (getRouterParam(event, 'handle') ?? '').toLowerCase()
    const dealId = getRouterParam(event, 'dealId') ?? ''
    if (!HANDLE_SHAPE.test(handle) || !isUuid(dealId)) {
      return err(domainError('NOT_FOUND', 'this deal does not exist'))
    }
    const result = await getContainer().queries.publicDeal(handle, dealId)
    if (!result) return err(domainError('NOT_FOUND', 'this deal does not exist'))
    setResponseHeader(event, 'Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300')
    return ok(result)
  },
})
