/** GET /api/v1/public/stores/:handle/sparks/:sparkId (Release 0.6) — one visible spark; V6 404-masked. */
import { z } from 'zod'
import { getRouterParam, setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../../../utils/container'
import type { PublicSparkResponse } from '@contracts/schemas/merchant/public-storefront.schema'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

const HANDLE_SHAPE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/i

export default definePublicEndpoint({
  name: 'public.spark',
  schema: z.object({}),
  rateLimit: { limit: 240, windowSeconds: 60 },
  async handler({ event }): Promise<Result<PublicSparkResponse, DomainError>> {
    const handle = (getRouterParam(event, 'handle') ?? '').toLowerCase()
    const sparkId = getRouterParam(event, 'sparkId') ?? ''
    if (!HANDLE_SHAPE.test(handle) || !isUuid(sparkId)) {
      return err(domainError('NOT_FOUND', 'this spark does not exist'))
    }
    const result = await getContainer().queries.publicSpark(handle, sparkId)
    if (!result) return err(domainError('NOT_FOUND', 'this spark does not exist'))
    setResponseHeader(event, 'Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300')
    return ok(result)
  },
})
