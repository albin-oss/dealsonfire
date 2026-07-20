/** POST /api/v1/sparks/:sparkId/delete (Release 0.6) — take a spark down (idempotent). */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'commerce.spark.delete',
  schema: z.object({ business_id: z.string().uuid() }).strict(),
  successStatus: 200,
  async handler({ event, auth, body, requestContext }): Promise<Result<{ deleted: boolean }, DomainError>> {
    const sparkId = getRouterParam(event, 'sparkId')
    if (!sparkId || !isUuid(sparkId)) return err(domainError('NOT_FOUND', 'spark not found'))
    const result = await getContainer().commerce.commands.deleteSpark({
      actor: { type: 'user', id: auth.userId }, userId: auth.userId,
      businessId: body.business_id, sparkId, requestContext,
    })
    return result.ok ? ok(result.value) : err(result.error)
  },
})
