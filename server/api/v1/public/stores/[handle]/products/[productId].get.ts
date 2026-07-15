/**
 * GET /api/v1/public/stores/:handle/products/:productId (Release 0.2) — one product,
 * iff visible (VISIBILITY_CONTRACT §1). Hidden, unknown, draft-store, and malformed all
 * answer the identical 404 (V6). Cacheable like the shelf.
 */
import { z } from 'zod'
import { getRouterParam, setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../../../utils/container'
import type { PublicProductResponse } from '@contracts/schemas/merchant/public-storefront.schema'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

const HANDLE_SHAPE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/i

export default definePublicEndpoint({
  name: 'public.product',
  schema: z.object({}),
  rateLimit: { limit: 240, windowSeconds: 60 },
  async handler({ event }): Promise<Result<PublicProductResponse, DomainError>> {
    const handle = (getRouterParam(event, 'handle') ?? '').toLowerCase()
    const productId = getRouterParam(event, 'productId') ?? ''
    if (!HANDLE_SHAPE.test(handle) || !isUuid(productId)) {
      return err(domainError('NOT_FOUND', 'this product does not exist'))
    }
    const result = await getContainer().queries.publicProduct(handle, productId)
    if (!result) return err(domainError('NOT_FOUND', 'this product does not exist'))
    setResponseHeader(event, 'Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300')
    return ok(result)
  },
})
