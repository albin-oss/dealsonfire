/** POST /api/v1/public/deals/:dealId/react (Release 0.4) — the 🔥 toggle. */
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { definePublicEndpoint } from '../../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../../utils/container'
import { getOrCreateVisitorId } from '../../../../../utils/visitor'
import { isUuid } from '@platform/uuid'
import { err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'public.deal-react',
  schema: z.object({}),
  rateLimit: { limit: 60, windowSeconds: 60 },
  async handler({ event, correlationId }): Promise<Result<{ active: boolean; count: number }, DomainError>> {
    const dealId = getRouterParam(event, 'dealId') ?? ''
    if (!isUuid(dealId)) return err(domainError('NOT_FOUND', 'this deal does not exist'))
    const visitorId = getOrCreateVisitorId(event)
    return getContainer().engagement.toggleReaction(dealId, visitorId, { correlation_id: correlationId })
  },
})
