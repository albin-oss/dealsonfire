/** POST /api/v1/sparks (Release 0.6) — publish a short update in the store's voice. */
import { defineCommandEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import { publishSparkRequest } from '@contracts/schemas/commerce/spark.schema'
import { ok, err, type Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'commerce.spark.publish',
  schema: publishSparkRequest,
  successStatus: 201,
  rateLimit: { limit: 60, windowSeconds: 3600 },
  async handler({ auth, body, requestContext }): Promise<Result<{ spark_id: string }, DomainError>> {
    const result = await getContainer().commerce.commands.publishSpark({
      actor: { type: 'user', id: auth.userId }, userId: auth.userId,
      businessId: body.business_id, storeId: body.store_id,
      body: body.body, mediaId: body.media_id ?? null, productId: body.product_id ?? null,
      requestContext,
    })
    return result.ok ? ok({ spark_id: result.value.sparkId }) : err(result.error)
  },
})
