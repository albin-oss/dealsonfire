/** POST /api/v1/deals/:dealId/end (Release 0.3) — the clock tells the truth. */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'commerce.deal.end',
  schema: z.object({ business_id: z.string().uuid() }).strict(),
  successStatus: 200,
  async handler({ event, auth, body, requestContext }): Promise<Result<{ ended: boolean }, DomainError>> {
    const dealId = getRouterParam(event, 'dealId')
    if (!dealId || !isUuid(dealId)) return err(domainError('NOT_FOUND', 'deal not found'))
    const result = await getContainer().commerce.commands.endDeal({
      actor: { type: 'user', id: auth.userId }, userId: auth.userId,
      businessId: body.business_id, dealId, requestContext,
    })
    return result.ok ? ok(result.value) : err(result.error)
  },
})
