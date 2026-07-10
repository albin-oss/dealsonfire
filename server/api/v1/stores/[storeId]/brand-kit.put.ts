/** PUT /api/v1/stores/:storeId/brand-kit — whole-value BrandKit replace (BLUEPRINT §4). */
import { getRouterParam } from 'h3'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { brandKitUpdateRequest, type BrandKitResponse } from '@contracts/schemas/merchant/brand-kit.schema'
import { isUuid } from '@domains/merchant/shared-kernel/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'merchant.store.brand_kit.update',
  schema: brandKitUpdateRequest,
  successStatus: 200,
  rateLimit: { limit: 60, windowSeconds: 3600 },
  async handler({ event, body, auth, requestContext }): Promise<Result<BrandKitResponse, DomainError>> {
    const storeId = getRouterParam(event, 'storeId')
    if (!storeId || !isUuid(storeId)) return err(domainError('NOT_FOUND', 'store not found'))

    const result = await getContainer().commands.updateBrandKit({
      actor: { type: 'user', id: auth.userId },
      userId: auth.userId,
      storeId,
      brandKit: {
        name: body.name,
        logoMediaId: body.logo_media_id ?? null,
        palette: body.palette,
        typography: body.typography,
        voice: body.voice,
      },
      stepUpVerified: auth.stepUpVerified,
      requestContext,
    })
    if (!result.ok) return err(result.error)
    return ok({
      store_id: result.value.storeId,
      name: result.value.name,
      logo_media_id: result.value.logoMediaId,
      palette: result.value.palette,
      typography: result.value.typography,
      voice: result.value.voice as BrandKitResponse['voice'],
    })
  },
})
