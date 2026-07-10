/** GET /api/v1/workspace — merchant workspace bootstrap (BLUEPRINT §4). */
import { defineQueryEndpoint } from '../../utils/define-command-endpoint'
import { getContainer } from '../../utils/container'
import type { WorkspaceOverviewResponse } from '@contracts/schemas/merchant/workspace.schema'

export default defineQueryEndpoint({
  async handler({ auth }): Promise<WorkspaceOverviewResponse> {
    const overview = await getContainer().queries.workspaceOverview(auth.userId)
    return {
      merchant: overview.merchant
        ? { merchant_id: overview.merchant.merchantId, display_name: overview.merchant.displayName }
        : null,
      businesses: overview.businesses.map((b) => ({
        business_id: b.businessId,
        display_name: b.displayName,
        business_type: b.businessType,
        trust_level: b.trustLevel,
        scale_tier: b.scaleTier,
        standing: b.standing,
        membership: {
          membership_id: b.membership.membershipId,
          roles: b.membership.roles,
          store_scope: b.membership.storeScope,
        },
        capabilities: b.capabilities,
        stores: b.stores.map((s) => ({
          store_id: s.storeId,
          handle: s.handle,
          name: s.name,
          status: s.status,
          enforcement_hold: s.enforcementHold,
          completion_score: s.completionScore,
          published_at: s.publishedAt,
        })),
      })),
    }
  },
})
