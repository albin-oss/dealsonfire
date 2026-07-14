/** POST /api/v1/attribute-sets (PROMPT-016) — create a business-scoped attribute set. */
import { defineCommandEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import { createAttributeSetRequest } from '@contracts/schemas/commerce/attribute-set.schema'
import { ok, err, type Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'commerce.attribute_set.create',
  schema: createAttributeSetRequest,
  successStatus: 201,
  async handler({ auth, body, requestContext }): Promise<Result<{ id: string }, DomainError>> {
    const result = await getContainer().commerce.commands.createAttributeSet({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      businessId: body.business_id,
      name: body.name,
      definitions: body.definitions,
      requestContext,
    })
    return result.ok ? ok(result.value) : err(result.error)
  },
})
