/**
 * Access resolution shared by business-scoped commands: load business + caller's active
 * membership + effective capabilities, then run the triple gate. Unknown business or no
 * membership answers NOT_FOUND — existence masking against cross-tenant probes (BLUEPRINT §9).
 */
import { type Result, ok, err } from '../../../../shared/result'
import type { DomainError } from '../../../../shared/errors'
import { domainError } from '../../../../shared/errors'
import type { KernelDeps } from './deps'
import type { EntitlementService } from './entitlement-service'
import type { Business } from '../domain/business'
import type { StaffMembership } from '../domain/staff-membership'
import type { Tx } from '../domain/ports'
import type { Actor } from '../../shared-kernel/actor'
import { authorize, type CommandSpec } from '../../shared-kernel/command-gate'
import { asBusinessId } from '../../shared-kernel/ids'

export interface ResolvedAccess {
  business: Business
  membership: StaffMembership
  capabilities: ReadonlySet<string>
}

export async function resolveAndAuthorize(
  deps: KernelDeps,
  entitlements: EntitlementService,
  tx: Tx,
  input: {
    actor: Actor
    userId: string
    businessId: string
    spec: CommandSpec
    storeId?: string
    stepUpVerified?: boolean
    lockBusiness?: boolean
  },
): Promise<Result<ResolvedAccess, DomainError>> {
  const business = await deps.businesses.findById(tx, asBusinessId(input.businessId), { forUpdate: input.lockBusiness })
  if (!business || !business.isOpen) return err(domainError('NOT_FOUND', 'business not found'))

  const membership = await deps.staff.findActiveForUser(tx, business.id, input.userId)
  if (!membership) return err(domainError('NOT_FOUND', 'business not found')) // masking

  const capabilities = await entitlements.resolveEffective(tx, business)

  const gate = authorize(
    {
      actor: input.actor,
      membership: {
        id: membership.id,
        roles: membership.roles,
        status: membership.status,
        storeScope: membership.storeScope,
        expiresAt: membership.expiresAt,
      },
      business: { id: business.id, trustLevel: business.trustLevel, scaleTier: business.scaleTier, standing: business.standing },
      effectiveCapabilities: capabilities,
      storeId: input.storeId,
      stepUpVerified: input.stepUpVerified,
    },
    input.spec,
  )
  if (!gate.ok) return gate

  return ok({ business, membership, capabilities })
}
