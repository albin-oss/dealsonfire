/** POST /api/v1/locations/:locationId/close — step-up-guarded (ADR-001 §12.3); L2 educates. */
import { getRouterParam } from 'h3'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { emptyLocationRequest } from '@contracts/schemas/operations/location.schema'
import type { LocationDTO } from '@domains/operations/locations/application/dto'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'operations.location.close',
  schema: emptyLocationRequest,
  successStatus: 200,
  rateLimit: { limit: 30, windowSeconds: 3600 },
  async handler({ event, auth, requestContext }): Promise<Result<LocationDTO, DomainError>> {
    const locationId = getRouterParam(event, 'locationId')
    if (!locationId || !isUuid(locationId)) return err(domainError('NOT_FOUND', 'location not found'))
    const result = await getContainer().operations.commands.closeLocation({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      locationId,
      stepUpVerified: auth.stepUpVerified,
      requestContext,
    })
    return result.ok ? ok(result.value) : err(result.error)
  },
})
