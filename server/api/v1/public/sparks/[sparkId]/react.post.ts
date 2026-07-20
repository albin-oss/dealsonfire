/** POST /api/v1/public/sparks/:sparkId/react (Release 0.6) — the 🔥 toggle for sparks. */
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { definePublicEndpoint } from '../../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../../utils/container'
import { getOrCreateVisitorId } from '../../../../../utils/visitor'
import { isUuid } from '@platform/uuid'
import { err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'public.spark-react',
  schema: z.object({}),
  rateLimit: { limit: 60, windowSeconds: 60 },
  async handler({ event, correlationId }): Promise<Result<{ active: boolean; count: number }, DomainError>> {
    const sparkId = getRouterParam(event, 'sparkId') ?? ''
    if (!isUuid(sparkId)) return err(domainError('NOT_FOUND', 'this spark does not exist'))
    const visitorId = getOrCreateVisitorId(event)
    return getContainer().engagement.toggleSparkReaction(sparkId, visitorId, { correlation_id: correlationId })
  },
})
