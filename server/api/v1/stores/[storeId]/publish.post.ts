/** POST /api/v1/stores/:storeId/publish — Draft/Paused → Live (BLUEPRINT §4). */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import type { PublishStoreResponse } from '@contracts/schemas/merchant/store.schema'
import { isUuid } from '@domains/merchant/shared-kernel/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'merchant.store.publish',
  schema: z.object({}).strict(), // publish takes no body; wrapper feeds {} for empty bodies
  successStatus: 200,
  rateLimit: { limit: 30, windowSeconds: 3600 }, // anti publish/unpublish cycling (BLUEPRINT §9)
  async handler({ event, auth, requestContext }): Promise<Result<PublishStoreResponse, DomainError>> {
    const storeId = getRouterParam(event, 'storeId')
    if (!storeId || !isUuid(storeId)) return err(domainError('NOT_FOUND', 'store not found'))

    const container = getContainer()
    const result = await container.commands.publishStore({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      storeId,
      stepUpVerified: auth.stepUpVerified,
      requestContext,
    })
    if (!result.ok) return err(result.error)

    // Opportunistic dispatch: the launch moment should not wait for the next cron tick
    // (store.published → Community launch Spark, Search, projections). waitUntil keeps the
    // serverless instance alive past the response (REVIEW-001 M-7); cron remains the guarantee.
    const dispatch = container.dispatcher.dispatchPending().catch(() => {})
    if (typeof event.waitUntil === 'function') event.waitUntil(dispatch)

    return ok({
      store_id: result.value.storeId,
      status: 'live',
      published_at: result.value.publishedAt!,
      store_url: result.value.storeUrl,
    })
  },
})
