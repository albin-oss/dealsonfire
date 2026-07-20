/** GET /api/v1/public/sparks/:sparkId/engagement — per-visitor snapshot for the spark page. */
import { z } from 'zod'
import { getRouterParam, setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../../utils/container'
import { getVisitorId } from '../../../../../utils/visitor'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'public.spark-engagement',
  schema: z.object({}),
  rateLimit: { limit: 240, windowSeconds: 60 },
  async handler({ event }): Promise<Result<Record<string, unknown>, DomainError>> {
    const sparkId = getRouterParam(event, 'sparkId') ?? ''
    if (!isUuid(sparkId)) return err(domainError('NOT_FOUND', 'this spark does not exist'))
    const snapshot = await getContainer().engagement.sparkEngagement(sparkId, getVisitorId(event))
    if (!snapshot) return err(domainError('NOT_FOUND', 'this spark does not exist'))
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return ok(snapshot as unknown as Record<string, unknown>)
  },
})
