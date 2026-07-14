/** POST /api/v1/brands (PROMPT-016) — add a brand to the business's pick-list (idempotent). */
import { defineCommandEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import { createBrandRefRequest } from '@contracts/schemas/commerce/attribute-set.schema'
import { ok, err, type Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'commerce.brand_ref.create',
  schema: createBrandRefRequest,
  successStatus: 201,
  async handler({ auth, body, requestContext }): Promise<Result<{ id: string }, DomainError>> {
    const result = await getContainer().commerce.commands.createBrandRef({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      businessId: body.business_id,
      name: body.name,
      requestContext,
    })
    return result.ok ? ok(result.value) : err(result.error)
  },
})
