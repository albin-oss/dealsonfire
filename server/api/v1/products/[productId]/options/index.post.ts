/** POST /api/v1/products/:productId/options (IMP-COM-001C, closes ACCEPTANCE-001 B2). */
import { getRouterParam } from 'h3'
import { defineCommandEndpoint } from '../../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../../utils/container'
import { addOptionRequest } from '@contracts/schemas/commerce/product.schema'
import type { ProductDTO } from '@domains/commerce/catalog/application/dto'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'commerce.product.option_add',
  schema: addOptionRequest,
  successStatus: 201,
  rateLimit: { limit: 120, windowSeconds: 3600 },
  async handler({ event, body, auth, requestContext }): Promise<Result<ProductDTO, DomainError>> {
    const productId = getRouterParam(event, 'productId')
    if (!productId || !isUuid(productId)) return err(domainError('NOT_FOUND', 'product not found'))
    const result = await getContainer().commerce.commands.addOption({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      productId,
      name: body.name,
      values: body.values,
      existingVariantsValue: body.existing_variants_value,
      variantAssignments: body.variant_assignments,
      requestContext,
    })
    return result.ok ? ok(result.value) : err(result.error)
  },
})
