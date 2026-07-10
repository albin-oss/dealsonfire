/**
 * CloseLocation (OPS-001 §6): step-up-guarded (ADR-001 §12.3), L2-enforced via the
 * StockAtLocationPort fact, idempotent on already-closed (kernel silent no-op).
 */
import { type Result, ok } from '../../../../../shared/result'
import type { DomainError } from '../../../../../shared/errors'
import { traceFromRequest } from '../../../../../platform/trace'
import type { Actor } from '../../../../merchant/shared-kernel/actor'
import { asLocationId } from '../../../shared-kernel/ids'
import type { OperationsDeps } from '../../../shared-kernel/ports'
import { withAuthorizedLocation } from '../access'
import { locationToDTO, type LocationDTO } from '../dto'

export interface CloseLocationCommand {
  actor: Actor
  userId: string
  locationId: string
  stepUpVerified: boolean
  requestContext?: Record<string, unknown>
}

export function closeLocationCommand(deps: OperationsDeps) {
  return async (input: CloseLocationCommand): Promise<Result<LocationDTO, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const authorized = await withAuthorizedLocation(deps, tx, {
        userId: input.userId, actor: input.actor, locationId: input.locationId,
        stepUpVerified: input.stepUpVerified,
        spec: {
          command: 'operations.location.close',
          permission: 'ops.location.write',
          sensitivity: 'sensitive', // step-up protocol (ADR-001 §12.3)
        },
      })
      if (!authorized.ok) return authorized
      const { location } = authorized.value

      const hasStock = await deps.stockAtLocation.hasStock(tx, asLocationId(location.id))
      const closed = location.close(hasStock, input.actor)
      if (!closed.ok) return closed

      const events = location.pullPendingEvents()
      if (events.length > 0) { // already-closed is a silent no-op
        await deps.locations.update(tx, location)
        await deps.eventStore.append(tx, events, traceFromRequest(input.requestContext))
        await deps.audit.record(tx, {
          businessId: location.businessId, actor: input.actor, command: 'operations.location.close',
          sensitivity: 'sensitive', target: { type: 'location', id: location.id },
          afterDigest: { status: 'closed' },
          context: input.requestContext,
        })
      }
      return ok(locationToDTO(location))
    })
  }
}
