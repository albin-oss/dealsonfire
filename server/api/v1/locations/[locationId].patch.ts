/** PATCH /api/v1/locations/:locationId — update (detected-change; D-29). */
import { getRouterParam } from 'h3'
import { defineCommandEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import { updateLocationRequest } from '@contracts/schemas/operations/location.schema'
import type { LocationDTO } from '@domains/operations/locations/application/dto'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'operations.location.update',
  schema: updateLocationRequest,
  successStatus: 200,
  rateLimit: { limit: 120, windowSeconds: 3600 },
  async handler({ event, body, auth, requestContext }): Promise<Result<LocationDTO, DomainError>> {
    const locationId = getRouterParam(event, 'locationId')
    if (!locationId || !isUuid(locationId)) return err(domainError('NOT_FOUND', 'location not found'))
    const result = await getContainer().operations.commands.updateLocation({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      locationId,
      changes: {
        name: body.name,
        address: body.address,
        pickupInstructions: body.pickup_instructions,
        operatingWindow: body.operating_window === null
          ? null
          : body.operating_window
            ? { startsAt: new Date(body.operating_window.starts_at), endsAt: new Date(body.operating_window.ends_at), timezone: body.operating_window.timezone }
            : undefined,
      },
      requestContext,
    })
    return result.ok ? ok(result.value) : err(result.error)
  },
})
