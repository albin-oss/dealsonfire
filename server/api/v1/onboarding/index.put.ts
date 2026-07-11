/** PUT /api/v1/onboarding (CAP-R1-MER-002). Save an answer patch — save-and-resume. */
import { defineCommandEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import { saveOnboardingRequest } from '@contracts/schemas/merchant/onboarding-profile.schema'
import { onboardingViewToResponse } from '@domains/merchant/onboarding/application/onboarding-service'
import type { OnboardingProfileResponse } from '@contracts/schemas/merchant/onboarding-profile.schema'
import { ok, type Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'merchant.onboarding.save',
  schema: saveOnboardingRequest,
  successStatus: 200,
  async handler({ auth, body }): Promise<Result<OnboardingProfileResponse, DomainError>> {
    const view = await getContainer().onboarding.save(auth.userId, body.answers)
    return ok(onboardingViewToResponse(view))
  },
})
