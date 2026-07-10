/**
 * Operations access resolution (CDC-001 §3: every command runs the triple gate in the
 * merchant's context). Masking law: unknown business, unknown location, and non-member
 * all answer the same NOT_FOUND.
 */
import { type Result, ok, err } from '../../../../shared/result'
import { domainError, type DomainError } from '../../../../shared/errors'
import type { Tx } from '../../../../platform/types'
import type { Actor } from '../../../merchant/shared-kernel/actor'
import { authorize, type CommandSpec } from '../../../merchant/shared-kernel/command-gate'
import { asLocationId } from '../../shared-kernel/ids'
import type { MerchantAccess, OperationsDeps } from '../../shared-kernel/ports'
import type { Location } from '../domain/location'

export async function withAuthorizedBusiness(
  deps: OperationsDeps,
  tx: Tx,
  input: { userId: string; actor: Actor; businessId: string; spec: CommandSpec; stepUpVerified?: boolean },
): Promise<Result<MerchantAccess, DomainError>> {
  const resolved = await deps.merchantAccess.resolveAccess(tx, input.userId, input.businessId)
  if (!resolved.ok) return resolved
  const gate = authorize(
    {
      actor: input.actor,
      membership: resolved.value.membership,
      business: resolved.value.business,
      effectiveCapabilities: resolved.value.capabilities,
      stepUpVerified: input.stepUpVerified,
    },
    input.spec,
  )
  if (!gate.ok) return gate
  return resolved
}

export interface AuthorizedLocation {
  location: Location
  access: MerchantAccess
}

export async function withAuthorizedLocation(
  deps: OperationsDeps,
  tx: Tx,
  input: { userId: string; actor: Actor; locationId: string; spec: CommandSpec; stepUpVerified?: boolean },
): Promise<Result<AuthorizedLocation, DomainError>> {
  const location = await deps.locations.findById(tx, asLocationId(input.locationId), { forUpdate: true })
  if (!location) return err(domainError('NOT_FOUND', 'location not found'))

  const resolved = await deps.merchantAccess.resolveAccess(tx, input.userId, location.businessId)
  if (!resolved.ok) return err(domainError('NOT_FOUND', 'location not found')) // cross-tenant masked

  const gate = authorize(
    {
      actor: input.actor,
      membership: resolved.value.membership,
      business: resolved.value.business,
      effectiveCapabilities: resolved.value.capabilities,
      stepUpVerified: input.stepUpVerified,
    },
    input.spec,
  )
  if (!gate.ok) return gate
  return ok({ location, access: resolved.value })
}
