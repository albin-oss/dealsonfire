/**
 * MerchantAccessPort adapter (IMP-COM-001B) — the composition root implements commerce's
 * port using merchant's kernel services. This file is the ONLY sanctioned place where
 * commerce's needs and merchant's internals meet (ADR-003 F3; the boundary lint forbids
 * commerce importing merchant/core directly).
 */
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'
import type { Tx } from '@platform/types'
import type { KernelDeps } from '@domains/merchant/core/application/deps'
import type { EntitlementService } from '@domains/merchant/core/application/entitlement-service'
import { asBusinessId } from '@domains/merchant/shared-kernel/ids'
import type { MerchantAccessPort, MerchantAccess } from '@domains/commerce/catalog/application/ports'

export function merchantAccessAdapter(deps: KernelDeps, entitlements: EntitlementService): MerchantAccessPort {
  return {
    async resolveAccess(tx: Tx, userId: string, businessId: string): Promise<Result<MerchantAccess, DomainError>> {
      const business = await deps.businesses.findById(tx, asBusinessId(businessId))
      if (!business || !business.isOpen) return err(domainError('NOT_FOUND', 'business not found'))
      const membership = await deps.staff.findActiveForUser(tx, business.id, userId)
      if (!membership) return err(domainError('NOT_FOUND', 'business not found')) // masking
      const capabilities = await entitlements.resolveEffective(tx, business)
      return ok({
        membership: {
          id: membership.id,
          roles: membership.roles,
          status: membership.status,
          storeScope: membership.storeScope,
          expiresAt: membership.expiresAt,
        },
        business: {
          id: business.id,
          trustLevel: business.trustLevel,
          scaleTier: business.scaleTier,
          standing: business.standing,
        },
        capabilities,
      })
    },
  }
}
