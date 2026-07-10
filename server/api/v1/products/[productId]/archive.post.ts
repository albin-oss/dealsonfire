/** POST /api/v1/products/:productId/archive (IMP-COM-001B). */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import type { ProductDTO } from '@domains/commerce/catalog/application/dto'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'commerce.product.archive',
  schema: z.object({}).strict(),
  successStatus: 200,
  rateLimit: { limit: 60, windowSeconds: 3600 },
  async handler({ event, auth, requestContext }): Promise<Result<ProductDTO, DomainError>> {
    const productId = getRouterParam(event, 'productId')
    if (!productId || !isUuid(productId)) return err(domainError('NOT_FOUND', 'product not found'))
    const result = await getContainer().commerce.commands.archiveProduct({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      productId,
      requestContext,
    })
    return result.ok ? ok(result.value) : err(result.error)
  },
})
