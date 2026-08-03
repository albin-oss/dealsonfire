/**
 * POST /api/v1/ops/businesses/:businessId/risk-resume (C10 Slice 4) — the HUMAN
 * act the approved policy requires: a paused till reopens only after review.
 * Audited sensitive with the reviewer's reason; masked for non-operators.
 */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../../utils/container'
import { isOperator } from '../../../../../utils/ops'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'ops.business.risk-resume',
  schema: z.object({ reason: z.string().min(1).max(500) }).strict(),
  successStatus: 200,
  async handler({ event, auth, body }): Promise<Result<{ resumed: true }, DomainError>> {
    if (!isOperator(auth.userId)) return err(domainError('NOT_FOUND', 'not found'))
    const businessId = getRouterParam(event, 'businessId') ?? ''
    if (!isUuid(businessId)) return err(domainError('NOT_FOUND', 'not found'))
    const c = getContainer()
    return c.deps.uow.withTransaction(async (tx): Promise<Result<{ resumed: true }, DomainError>> => {
      const profile = await c.payments.service.getPaymentProfile(tx, businessId)
      if (!profile) return err(domainError('NOT_FOUND', 'not found'))
      await c.payments.service.riskResume(tx, businessId)
      await c.audit.record(tx, {
        businessId, actor: { type: 'admin', id: auth.userId }, command: 'ops.business.risk-resume',
        sensitivity: 'sensitive', target: { type: 'business', id: businessId },
        afterDigest: { reason: body.reason },
      })
      return ok({ resumed: true })
    })
  },
})
