/** GET /api/v1/products — merchant-scoped catalog grid (keyset pagination). */
import { getQuery } from 'h3'
import { defineQueryEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import { sendProblem } from '../../../utils/problem'
import { listProductsQuerySchema } from '@contracts/schemas/commerce/product.schema'
import { pageRequest } from '@platform/pagination'
import { domainError } from '@shared/errors'

export default defineQueryEndpoint({
  async handler({ event, auth }) {
    const parsed = listProductsQuerySchema.safeParse(getQuery(event))
    if (!parsed.success) {
      return sendProblem(event, domainError('VALIDATION_FAILED', 'invalid query parameters', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      }))
    }
    const { limit, cursor } = pageRequest(parsed.data.limit, parsed.data.cursor)
    const result = await getContainer().commerce.queries.listProducts({
      userId: auth.userId,
      actor: { type: 'user', id: auth.userId },
      businessId: parsed.data.business_id,
      status: parsed.data.status,
      showArchived: parsed.data.show_archived === 'true',
      q: parsed.data.q,
      limit,
      cursor,
    })
    if (!result.ok) return sendProblem(event, result.error)
    return { items: result.value.items, next_cursor: result.value.nextCursor }
  },
})
