/** POST /api/v1/businesses — create business (One Identity; BLUEPRINT §4). */
import { defineCommandEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import { createBusinessRequest, type BusinessSummaryResponse } from '@contracts/schemas/merchant/business.schema'
import type { BusinessType } from '@domains/merchant/core/domain/business'
import { ok, err, type Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'merchant.business.create',
  schema: createBusinessRequest,
  successStatus: 201,
  rateLimit: { limit: 10, windowSeconds: 3600 },
  async handler({ body, auth, requestContext }): Promise<Result<BusinessSummaryResponse, DomainError>> {
    const result = await getContainer().commands.createBusiness({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      displayName: body.display_name,
      businessType: body.business_type as BusinessType,
      requestContext,
    })
    if (!result.ok) return err(result.error)
    return ok({
      business_id: result.value.businessId,
      membership_id: result.value.membershipId,
      merchant_id: result.value.merchantId,
      display_name: result.value.displayName,
      business_type: result.value.businessType,
      trust_level: result.value.trustLevel as BusinessSummaryResponse['trust_level'],
      scale_tier: result.value.scaleTier as BusinessSummaryResponse['scale_tier'],
      standing: result.value.standing as BusinessSummaryResponse['standing'],
    })
  },
})
