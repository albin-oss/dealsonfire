/** GET /api/v1/sparks?business_id — the merchant's spark timeline. */
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
    if (!parsed.success) return sendProblem(event, domainError('VALIDATION_FAILED', 'business_id required'))
    const result = await getContainer().commerce.queries.listSparks({
      userId: auth.userId, businessId: parsed.data.business_id,
    })
    if (!result.ok) return sendProblem(event, result.error)
    return { items: result.value }
  },
})
