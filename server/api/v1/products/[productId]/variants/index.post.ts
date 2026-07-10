/** POST /api/v1/products/:productId/variants (IMP-COM-001B). */
import { getRouterParam } from 'h3'
import { defineCommandEndpoint } from '../../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../../utils/container'
import { addVariantRequest } from '@contracts/schemas/commerce/product.schema'
import type { ProductDTO } from '@domains/commerce/catalog/application/dto'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'commerce.variant.add',
  schema: addVariantRequest,
  successStatus: 201,
  rateLimit: { limit: 120, windowSeconds: 3600 },
  async handler({ event, body, auth, requestContext }): Promise<Result<ProductDTO, DomainError>> {
    const productId = getRouterParam(event, 'productId')
    if (!productId || !isUuid(productId)) return err(domainError('NOT_FOUND', 'product not found'))
    const result = await getContainer().commerce.commands.addVariant({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      productId,
      variant: {
        sku: body.sku,
        optionValues: body.option_values,
        price: body.price,
        sale: body.sale ? { amount: body.sale.amount, startsAt: new Date(body.sale.starts_at), endsAt: new Date(body.sale.ends_at) } : null,
        kindData: body.kind_data ?? null,
      },
      requestContext,
    })
    return result.ok ? ok(result.value) : err(result.error)
  },
})
