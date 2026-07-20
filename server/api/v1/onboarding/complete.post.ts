/** POST /api/v1/onboarding/complete (CAP-R1-MER-002). Finalize discovery; workspace tailors. */
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import { onboardingViewToResponse } from '@domains/merchant/onboarding/application/onboarding-service'
import type { OnboardingProfileResponse } from '@contracts/schemas/merchant/onboarding-profile.schema'
import { ok, type Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'merchant.onboarding.complete',
  schema: z.object({}).strict(),
  successStatus: 200,
  async handler({ auth }): Promise<Result<OnboardingProfileResponse, DomainError>> {
    const view = await getContainer().onboarding.complete(auth.userId)
    return ok(onboardingViewToResponse(view))
  },
})
