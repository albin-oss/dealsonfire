/** UpdateLocation (OPS-001 §6): detected-change semantics; no-ops persist and audit nothing (D-29). */
import { type Result, ok } from '../../../../../shared/result'
import type { DomainError } from '../../../../../shared/errors'
import { traceFromRequest } from '../../../../../platform/trace'
import type { Actor } from '../../../../merchant/shared-kernel/actor'
import type { OperationsDeps } from '../../../shared-kernel/ports'
import { createAddress, createOperatingWindow, type Address, type OperatingWindow } from '../../domain/value-objects'
import { withAuthorizedLocation } from '../access'
import { locationToDTO, type LocationDTO } from '../dto'

export interface UpdateLocationCommand {
  actor: Actor
  userId: string
  locationId: string
  changes: {
    name?: string
    address?: { line1: string; line2?: string | null; city: string; region?: string | null; postal: string; country: string } | null
    pickupInstructions?: string | null
    operatingWindow?: { startsAt: Date; endsAt: Date; timezone: string } | null
  }
  requestContext?: Record<string, unknown>
}

export function updateLocationCommand(deps: OperationsDeps) {
  return async (input: UpdateLocationCommand): Promise<Result<LocationDTO, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const authorized = await withAuthorizedLocation(deps, tx, {
        userId: input.userId, actor: input.actor, locationId: input.locationId,
        spec: { command: 'operations.location.update', permission: 'ops.location.write' }, // capability gates CREATION only (D-39: tier caps creation, never management)
      })
      if (!authorized.ok) return authorized
      const { location } = authorized.value

      let address: Address | null | undefined = input.changes.address ? undefined : input.changes.address
      if (input.changes.address) {
        const made = createAddress(input.changes.address)
        if (!made.ok) return made
        address = made.value
      }
      let window: OperatingWindow | null | undefined = input.changes.operatingWindow ? undefined : input.changes.operatingWindow
      if (input.changes.operatingWindow) {
        const made = createOperatingWindow(input.changes.operatingWindow)
        if (!made.ok) return made
        window = made.value
      }

      const updated = location.update({
        name: input.changes.name,
        address,
        pickupInstructions: input.changes.pickupInstructions,
        operatingWindow: window,
      }, input.actor)
      if (!updated.ok) return updated

      const events = location.pullPendingEvents()
      if (events.length > 0) { // D-29: detected no-ops persist and audit nothing
        await deps.locations.update(tx, location)
        await deps.eventStore.append(tx, events, traceFromRequest(input.requestContext))
        await deps.audit.record(tx, {
          businessId: location.businessId, actor: input.actor, command: 'operations.location.update',
          sensitivity: 'normal', target: { type: 'location', id: location.id },
          afterDigest: { events: events.map((e) => e.eventType) },
          context: input.requestContext,
        })
      }
      return ok(locationToDTO(location))
    })
  }
}
