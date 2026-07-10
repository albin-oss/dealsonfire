/** POST /api/v1/businesses/:businessId/locations — create location (OPS-001 §6). */
import { getRouterParam } from 'h3'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { createLocationRequest } from '@contracts/schemas/operations/location.schema'
import type { LocationDTO } from '@domains/operations/locations/application/dto'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'operations.location.create',
  schema: createLocationRequest,
  successStatus: 201,
  rateLimit: { limit: 60, windowSeconds: 3600 },
  async handler({ event, body, auth, requestContext }): Promise<Result<LocationDTO, DomainError>> {
    const businessId = getRouterParam(event, 'businessId')
    if (!businessId || !isUuid(businessId)) return err(domainError('NOT_FOUND', 'business not found'))
    const result = await getContainer().operations.commands.createLocation({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      businessId,
      kind: body.kind,
      name: body.name,
      address: body.address ?? null,
      pickupInstructions: body.pickup_instructions ?? null,
      operatingWindow: body.operating_window
        ? { startsAt: new Date(body.operating_window.starts_at), endsAt: new Date(body.operating_window.ends_at), timezone: body.operating_window.timezone }
        : null,
      requestContext,
    })
    return result.ok ? ok(result.value) : err(result.error)
  },
})
