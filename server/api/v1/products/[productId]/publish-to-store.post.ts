/** POST /api/v1/products/:productId/publish-to-store (VISIBILITY_CONTRACT §6). */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { isUuid } from '@domains/merchant/shared-kernel/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'commerce.listing.publish',
  schema: z.object({ store_id: z.string().uuid() }).strict(),
  successStatus: 200,
  async handler({ event, auth, body, requestContext }): Promise<Result<{ status: string; changed: boolean }, DomainError>> {
    const productId = getRouterParam(event, 'productId')
    if (!productId || !isUuid(productId)) return err(domainError('NOT_FOUND', 'product not found'))
    const result = await getContainer().commerce.commands.publishToStore({
      actor: { type: 'user', id: auth.userId }, userId: auth.userId,
      productId, storeId: body.store_id, requestContext,
    })
    return result.ok ? ok({ status: result.value.status, changed: result.value.changed }) : err(result.error)
  },
})
