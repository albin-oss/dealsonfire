/** GET /api/v1/onboarding (CAP-R1-MER-002). The merchant's discovery profile + live recommendation. */
import { defineQueryEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import { onboardingViewToResponse } from '@domains/merchant/onboarding/application/onboarding-service'
import type { OnboardingProfileResponse } from '@contracts/schemas/merchant/onboarding-profile.schema'

export default defineQueryEndpoint({
  async handler({ auth }): Promise<OnboardingProfileResponse> {
    const view = await getContainer().onboarding.get(auth.userId)
    return onboardingViewToResponse(view)
  },
})
