/**
 * WorkspaceOverview query (BLUEPRINT §4 GET /workspace): memberships → businesses →
 * stores → effective capabilities. Reads aggregate tables directly (DECISIONS D-13);
 * becomes a projection when Pulse lands (Module 3). No merchant account → empty
 * workspace, 200 (DECISIONS D-05 — Opportunity First).
 */
import type { KernelDeps } from '../deps'
import type { EntitlementService } from '../entitlement-service'
import { asUserId } from '../../../shared-kernel/ids'

export interface WorkspaceOverviewDTO {
  merchant: { merchantId: string; displayName: string } | null
  businesses: Array<{
    businessId: string
    displayName: string
    businessType: string
    trustLevel: string
    scaleTier: string
    standing: string
    membership: { membershipId: string; roles: string[]; storeScope: string[] | null }
    capabilities: string[]
    stores: Array<{
      storeId: string
      handle: string
      name: string
      status: string
      enforcementHold: string
      completionScore: number
      publishedAt: string | null
    }>
  }>
}

export function workspaceOverviewQuery(deps: KernelDeps, entitlements: EntitlementService) {
  return async (userId: string): Promise<WorkspaceOverviewDTO> => {
    return deps.uow.withTransaction(async (tx) => {
      const account = await deps.merchantAccounts.findByUserId(tx, asUserId(userId))
      if (!account) return { merchant: null, businesses: [] }

      const memberships = await deps.staff.listActiveByPrincipal(tx, userId)
      const businesses: WorkspaceOverviewDTO['businesses'] = []

      for (const membership of memberships) {
        const business = await deps.businesses.findById(tx, membership.businessId)
        if (!business || !business.isOpen) continue
        const [capabilities, stores] = await Promise.all([
          entitlements.resolveEffective(tx, business),
          deps.stores.listByBusiness(tx, business.id),
        ])
        businesses.push({
          businessId: business.id,
          displayName: business.displayName,
          businessType: business.businessType,
          trustLevel: business.trustLevel,
          scaleTier: business.scaleTier,
          standing: business.standing,
          membership: {
            membershipId: membership.id,
            roles: [...membership.roles],
            storeScope: membership.storeScope ? [...membership.storeScope] : null,
          },
          capabilities: [...capabilities].sort(),
          stores: stores
            .filter((s) => s.status !== 'deleted')
            .map((s) => ({
              storeId: s.id,
              handle: s.handle as string,
              name: s.name,
              status: s.status,
              enforcementHold: s.enforcementHold,
              completionScore: s.completionScore,
              publishedAt: s.publishedAt?.toISOString() ?? null,
            })),
        })
      }

      return { merchant: { merchantId: account.id, displayName: account.displayName }, businesses }
    })
  }
}
