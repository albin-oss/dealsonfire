/** POST /api/v1/businesses/:businessId/stores — create store (BLUEPRINT §4). */
import { getRouterParam } from 'h3'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { createStoreRequest, type StoreResponse } from '@contracts/schemas/merchant/store.schema'
import { isUuid } from '@domains/merchant/shared-kernel/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'merchant.store.create',
  schema: createStoreRequest,
  successStatus: 201,
  rateLimit: { limit: 20, windowSeconds: 3600 },
  async handler({ event, body, auth, requestContext }): Promise<Result<StoreResponse, DomainError>> {
    const businessId = getRouterParam(event, 'businessId')
    if (!businessId || !isUuid(businessId)) {
      return err(domainError('NOT_FOUND', 'business not found'))
    }
    const result = await getContainer().commands.createStore({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      businessId,
      name: body.name,
      handle: body.handle,
      stepUpVerified: auth.stepUpVerified,
      requestContext,
    })
    if (!result.ok) return err(result.error)
    return ok({
      store_id: result.value.storeId,
      business_id: result.value.businessId,
      handle: result.value.handle,
      name: result.value.name,
      status: result.value.status as StoreResponse['status'],
      enforcement_hold: result.value.enforcementHold as StoreResponse['enforcement_hold'],
    })
  },
})
