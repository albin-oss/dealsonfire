/** GET /api/v1/products/:productId — full product view incl. computed readiness. */
import { getRouterParam } from 'h3'
import { defineQueryEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { sendProblem } from '../../../../utils/problem'
import { isUuid } from '@platform/uuid'
import { domainError } from '@shared/errors'

export default defineQueryEndpoint({
  async handler({ event, auth }) {
    const productId = getRouterParam(event, 'productId')
    if (!productId || !isUuid(productId)) {
      return sendProblem(event, domainError('NOT_FOUND', 'product not found'))
    }
    const result = await getContainer().commerce.queries.getProduct({
      userId: auth.userId,
      actor: { type: 'user', id: auth.userId },
      productId,
    })
    if (!result.ok) return sendProblem(event, result.error)
    // display enrichment: the aggregate carries MediaRefs; the registry owns urls
    const urls = await getContainer().media.urlsFor(result.value.media.map((m) => m.media_id))
    return {
      ...result.value,
      media: result.value.media.map((m) => ({ ...m, url: urls[m.media_id] ?? null })),
    }
  },
})
