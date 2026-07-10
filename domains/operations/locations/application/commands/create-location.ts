/**
 * CreateLocation (OPS-001 §6/§7): merchant-created, never default (L1). Gate carries
 * the `ops.locations` capability — the Growth-tier multi-location line (CDC-001 §6).
 */
import { type Result, ok } from '../../../../../shared/result'
import type { DomainError } from '../../../../../shared/errors'
import { traceFromRequest } from '../../../../../platform/trace'
import { uuidv7 } from '../../../../../platform/uuid'
import type { Actor } from '../../../../merchant/shared-kernel/actor'
import { asLocationId } from '../../../shared-kernel/ids'
import type { OperationsDeps } from '../../../shared-kernel/ports'
import { Location } from '../../domain/location'
import { createAddress, createOperatingWindow, type LocationKind } from '../../domain/value-objects'
import { withAuthorizedBusiness } from '../access'
import { locationToDTO, type LocationDTO } from '../dto'

export interface CreateLocationCommand {
  actor: Actor
  userId: string
  businessId: string
  kind: Exclude<LocationKind, 'home'>
  name: string
  address?: { line1: string; line2?: string | null; city: string; region?: string | null; postal: string; country: string } | null
  pickupInstructions?: string | null
  operatingWindow?: { startsAt: Date; endsAt: Date; timezone: string } | null
  requestContext?: Record<string, unknown>
}

export function createLocationCommand(deps: OperationsDeps) {
  return async (input: CreateLocationCommand): Promise<Result<LocationDTO, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const access = await withAuthorizedBusiness(deps, tx, {
        userId: input.userId, actor: input.actor, businessId: input.businessId,
        spec: { command: 'operations.location.create', permission: 'ops.location.write', capability: 'ops.locations' },
      })
      if (!access.ok) return access

      let address = null
      if (input.address) {
        const made = createAddress(input.address)
        if (!made.ok) return made
        address = made.value
      }
      let window = null
      if (input.operatingWindow) {
        const made = createOperatingWindow(input.operatingWindow)
        if (!made.ok) return made
        window = made.value
      }

      const created = Location.create({
        id: asLocationId(uuidv7()),
        businessId: input.businessId,
        kind: input.kind,
        name: input.name,
        address,
        pickupInstructions: input.pickupInstructions ?? null,
        operatingWindow: window,
      }, input.actor)
      if (!created.ok) return created
      const location = created.value

      await deps.locations.insert(tx, location)
      await deps.eventStore.append(tx, location.pullPendingEvents(), traceFromRequest(input.requestContext))
      await deps.audit.record(tx, {
        businessId: input.businessId, actor: input.actor, command: 'operations.location.create',
        sensitivity: 'normal', target: { type: 'location', id: location.id },
        afterDigest: { kind: location.kind, name: location.name },
        context: input.requestContext,
      })
      return ok(locationToDTO(location))
    })
  }
}
