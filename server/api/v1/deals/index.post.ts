/** POST /api/v1/deals (Release 0.3) — publish a deal over an on-store product. */
import { defineCommandEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import { createDealRequest } from '@contracts/schemas/commerce/deal.schema'
import { ok, err, type Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'commerce.deal.create',
  schema: createDealRequest,
  successStatus: 201,
  rateLimit: { limit: 30, windowSeconds: 3600 },
  async handler({ auth, body, requestContext }): Promise<Result<{ deal_id: string }, DomainError>> {
    const result = await getContainer().commerce.commands.createDeal({
      actor: { type: 'user', id: auth.userId }, userId: auth.userId,
      productId: body.product_id, storeId: body.store_id,
      headline: body.headline, story: body.story ?? null, requestContext,
    })
    return result.ok ? ok({ deal_id: result.value.dealId }) : err(result.error)
  },
})
