/** GET /api/v1/public/stores/:handle/engagement (Release 1.0) — follower snapshot for the storefront. */
import { z } from 'zod'
import { getRouterParam, setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../../utils/container'
import { getVisitorId } from '../../../../../utils/visitor'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'public.store-engagement',
  schema: z.object({}),
  rateLimit: { limit: 240, windowSeconds: 60 },
  async handler({ event }): Promise<Result<Record<string, unknown>, DomainError>> {
    const handle = (getRouterParam(event, 'handle') ?? '').toLowerCase()
    const snapshot = await getContainer().engagement.storeEngagement(handle, getVisitorId(event))
    if (!snapshot) return err(domainError('NOT_FOUND', 'this store does not exist'))
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return ok(snapshot as unknown as Record<string, unknown>)
  },
})
