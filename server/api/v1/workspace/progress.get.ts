/**
 * GET /api/v1/workspace/progress (CAP-R1-MER-001). The merchant's onboarding ladder.
 * Composes identity (email verified) with the merchant workspace facts (business/store),
 * then runs the pure progress engine. Read-only; a user with no merchant account still
 * gets an honest ladder (account + email done, "create your business" next).
 */
import { defineQueryEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import { computeOnboardingProgress } from '@domains/merchant/core/domain/onboarding-progress'
import type { OnboardingProgressResponse } from '@contracts/schemas/merchant/onboarding.schema'

export default defineQueryEndpoint({
  async handler({ auth }): Promise<OnboardingProgressResponse> {
    const c = getContainer()
    const [user, overview] = await Promise.all([
      c.identity.auth.getUser(auth.userId),
      c.queries.workspaceOverview(auth.userId),
    ])

    const progress = computeOnboardingProgress({
      emailVerified: user?.emailVerified ?? false,
      hasBusiness: overview.businesses.length > 0,
      hasStore: overview.businesses.some((b) => b.stores.length > 0),
    })

    return {
      milestones: progress.milestones,
      completed_count: progress.completedCount,
      total_count: progress.totalCount,
      steps_to_first_sale: progress.stepsToFirstSale,
      next_milestone_id: progress.nextMilestoneId,
    }
  },
})
