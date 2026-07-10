/** GET /api/v1/businesses/:businessId/locations — list (ensures the Ghost lazily). */
import { getRouterParam } from 'h3'
import { defineQueryEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { sendProblem } from '../../../../utils/problem'
import { isUuid } from '@platform/uuid'
import { domainError } from '@shared/errors'

export default defineQueryEndpoint({
  async handler({ event, auth }) {
    const businessId = getRouterParam(event, 'businessId')
    if (!businessId || !isUuid(businessId)) {
      return sendProblem(event, domainError('NOT_FOUND', 'business not found'))
    }
    const result = await getContainer().operations.queries.listLocations({
      userId: auth.userId,
      actor: { type: 'user', id: auth.userId },
      businessId,
    })
    if (!result.ok) return sendProblem(event, result.error)
    return { items: result.value }
  },
})
