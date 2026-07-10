/** PUT /api/v1/products/:productId/media/order — permutation-strict reorder (silent no-op). */
import { getRouterParam } from 'h3'
import { defineCommandEndpoint } from '../../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../../utils/container'
import { reorderMediaRequest } from '@contracts/schemas/commerce/product.schema'
import type { ProductDTO } from '@domains/commerce/catalog/application/dto'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'commerce.product.media_reorder',
  schema: reorderMediaRequest,
  successStatus: 200,
  rateLimit: { limit: 240, windowSeconds: 3600 },
  async handler({ event, body, auth, requestContext }): Promise<Result<ProductDTO, DomainError>> {
    const productId = getRouterParam(event, 'productId')
    if (!productId || !isUuid(productId)) return err(domainError('NOT_FOUND', 'product not found'))
    const result = await getContainer().commerce.commands.reorderMedia({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      productId,
      orderedIds: body.ordered_ids,
      requestContext,
    })
    return result.ok ? ok(result.value) : err(result.error)
  },
})
