/**
 * ListLocations (OPS-001 §6). Read authorization rides 'store.view' (every merchant
 * role holds it — the commerce read precedent). The list lazily ensures the Ghost so
 * a business always answers with its default (first touch creates it — BLUEPRINT-003
 * §13.2's backfill, done lazily).
 */
import { type Result, ok } from '../../../../../shared/result'
import type { DomainError } from '../../../../../shared/errors'
import type { Actor } from '../../../../merchant/shared-kernel/actor'
import { authorize } from '../../../../merchant/shared-kernel/command-gate'
import type { OperationsDeps } from '../../../shared-kernel/ports'
import { ensureGhostLocationInTx } from '../commands/ensure-ghost-location'
import { locationToDTO, type LocationDTO } from '../dto'

const READ_SPEC = { command: 'operations.location.read', permission: 'store.view' as const, mode: 'read' as const, capability: 'store.core' }

export function listLocationsQuery(deps: OperationsDeps) {
  return async (input: { userId: string; actor: Actor; businessId: string }): Promise<Result<LocationDTO[], DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const access = await deps.merchantAccess.resolveAccess(tx, input.userId, input.businessId)
      if (!access.ok) return access
      const gate = authorize(
        { actor: input.actor, membership: access.value.membership, business: access.value.business, effectiveCapabilities: access.value.capabilities },
        READ_SPEC,
      )
      if (!gate.ok) return gate

      const ensured = await ensureGhostLocationInTx(deps, tx, { businessId: input.businessId })
      if (!ensured.ok) return ensured

      const locations = await deps.locations.listByBusiness(tx, input.businessId)
      return ok(locations.map(locationToDTO))
    })
  }
}
