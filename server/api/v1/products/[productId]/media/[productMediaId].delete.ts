/** DELETE /api/v1/products/:productId/media/:productMediaId (ACCEPTANCE-001 N3: the param names what it is). */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../../utils/container'
import type { ProductDTO } from '@domains/commerce/catalog/application/dto'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'commerce.product.media_remove',
  schema: z.object({}).strict(),
  successStatus: 200,
  rateLimit: { limit: 240, windowSeconds: 3600 },
  async handler({ event, auth, requestContext }): Promise<Result<ProductDTO, DomainError>> {
    const productId = getRouterParam(event, 'productId')
    const mediaId = getRouterParam(event, 'productMediaId')
    if (!productId || !isUuid(productId) || !mediaId || !isUuid(mediaId)) {
      return err(domainError('NOT_FOUND', 'product not found'))
    }
    const result = await getContainer().commerce.commands.removeMedia({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      productId,
      productMediaId: mediaId,
      requestContext,
    })
    return result.ok ? ok(result.value) : err(result.error)
  },
})
