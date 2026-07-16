/** POST /api/v1/public/stores/:handle/follow (Release 0.4) — follow toggle, live stores only. */
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { definePublicEndpoint } from '../../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../../utils/container'
import { getOrCreateVisitorId } from '../../../../../utils/visitor'
import { type Result } from '@shared/result'
import { type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'public.store-follow',
  schema: z.object({}),
  rateLimit: { limit: 60, windowSeconds: 60 },
  async handler({ event, correlationId }): Promise<Result<{ active: boolean; count: number }, DomainError>> {
    const handle = (getRouterParam(event, 'handle') ?? '').toLowerCase()
    const visitorId = getOrCreateVisitorId(event)
    return getContainer().engagement.followStore(handle, visitorId, { correlation_id: correlationId })
  },
})
