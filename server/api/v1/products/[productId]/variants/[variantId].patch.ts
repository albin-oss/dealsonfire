/** PATCH /api/v1/products/:productId/variants/:variantId — D-29: detected changes only. */
import { getRouterParam } from 'h3'
import { defineCommandEndpoint } from '../../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../../utils/container'
import { updateVariantRequest } from '@contracts/schemas/commerce/product.schema'
import type { ProductDTO } from '@domains/commerce/catalog/application/dto'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'commerce.variant.update',
  schema: updateVariantRequest,
  successStatus: 200,
  rateLimit: { limit: 240, windowSeconds: 3600 },
  async handler({ event, body, auth, requestContext }): Promise<Result<ProductDTO, DomainError>> {
    const productId = getRouterParam(event, 'productId')
    const variantId = getRouterParam(event, 'variantId')
    if (!productId || !isUuid(productId) || !variantId || !isUuid(variantId)) {
      return err(domainError('NOT_FOUND', 'product not found'))
    }
    const result = await getContainer().commerce.commands.updateVariant({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      productId,
      variantId,
      changes: {
        sku: body.sku,
        price: body.price,
        sale: body.sale === undefined ? undefined
          : body.sale === null ? null
          : { amount: body.sale.amount, startsAt: new Date(body.sale.starts_at), endsAt: new Date(body.sale.ends_at) },
        optionValues: body.option_values,
        kindData: body.kind_data,
      },
      requestContext,
    })
    return result.ok ? ok(result.value) : err(result.error)
  },
})
