/** PATCH /api/v1/products/:productId/options/:optionName — extend an option's values. */
import { getRouterParam } from 'h3'
import { defineCommandEndpoint } from '../../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../../utils/container'
import { patchOptionRequest } from '@contracts/schemas/commerce/product.schema'
import type { ProductDTO } from '@domains/commerce/catalog/application/dto'
import { isUuid } from '@platform/uuid'
import { decodedParam } from '../../../../../utils/params'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'commerce.product.option_values_add',
  schema: patchOptionRequest,
  successStatus: 200,
  rateLimit: { limit: 120, windowSeconds: 3600 },
  async handler({ event, body, auth, requestContext }): Promise<Result<ProductDTO, DomainError>> {
    const productId = getRouterParam(event, 'productId')
    const optionName = decodedParam(event, 'optionName', 30)
    if (!productId || !isUuid(productId)) return err(domainError('NOT_FOUND', 'product not found'))
    if (!optionName) return err(domainError('NOT_FOUND', 'option not found'))
    const result = await getContainer().commerce.commands.addOptionValues({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      productId,
      optionName,
      values: body.add_values,
      requestContext,
    })
    return result.ok ? ok(result.value) : err(result.error)
  },
})
