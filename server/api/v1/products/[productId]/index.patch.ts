/** PATCH /api/v1/products/:productId — atomic title/description/category update. */
import { getRouterParam } from 'h3'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { updateProductRequest } from '@contracts/schemas/commerce/product.schema'
import type { ProductDTO } from '@domains/commerce/catalog/application/dto'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'commerce.product.update',
  schema: updateProductRequest,
  successStatus: 200,
  rateLimit: { limit: 120, windowSeconds: 3600 },
  async handler({ event, body, auth, requestContext }): Promise<Result<ProductDTO, DomainError>> {
    const productId = getRouterParam(event, 'productId')
    if (!productId || !isUuid(productId)) return err(domainError('NOT_FOUND', 'product not found'))
    const result = await getContainer().commerce.commands.updateProductDetails({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      productId,
      title: body.title,
      description: body.description,
      categoryRef: body.category_path,
      requestContext,
    })
    return result.ok ? ok(result.value) : err(result.error)
  },
})
