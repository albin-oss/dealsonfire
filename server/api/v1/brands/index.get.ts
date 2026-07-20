/** GET /api/v1/brands?business_id= (PROMPT-016) — list the business's brand pick-list. */
import { getQuery } from 'h3'
import { z } from 'zod'
import { defineQueryEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import { sendProblem } from '../../../utils/problem'
import { domainError } from '@shared/errors'

const querySchema = z.object({ business_id: z.string().uuid() })

export default defineQueryEndpoint({
  async handler({ event, auth }) {
    const parsed = querySchema.safeParse(getQuery(event))
    if (!parsed.success) return sendProblem(event, domainError('VALIDATION_FAILED', 'business_id is required'))
    const result = await getContainer().commerce.queries.listBrandRefs({
      userId: auth.userId, actor: { type: 'user', id: auth.userId }, businessId: parsed.data.business_id,
    })
    if (!result.ok) return sendProblem(event, result.error)
    return { items: result.value }
  },
})
