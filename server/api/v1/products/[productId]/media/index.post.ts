/** POST /api/v1/products/:productId/media (IMP-COM-001B). */
import { getRouterParam } from 'h3'
import { defineCommandEndpoint } from '../../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../../utils/container'
import { addMediaRequest } from '@contracts/schemas/commerce/product.schema'
import type { ProductDTO } from '@domains/commerce/catalog/application/dto'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'commerce.product.media_add',
  schema: addMediaRequest,
  successStatus: 201,
  rateLimit: { limit: 240, windowSeconds: 3600 },
  async handler({ event, body, auth, requestContext }): Promise<Result<ProductDTO, DomainError>> {
    const productId = getRouterParam(event, 'productId')
    if (!productId || !isUuid(productId)) return err(domainError('NOT_FOUND', 'product not found'))
    const result = await getContainer().commerce.commands.addMedia({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      productId,
      mediaId: body.media_id,
      variantId: body.variant_id ?? null,
      role: body.role,
      altText: body.alt_text ?? null,
      requestContext,
    })
    return result.ok ? ok(result.value) : err(result.error)
  },
})
