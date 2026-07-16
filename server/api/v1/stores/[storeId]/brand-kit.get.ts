/** GET /api/v1/stores/:storeId/brand-kit (Release 0.5) — the identity editor's read. */
import { getRouterParam } from 'h3'
import { defineQueryEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { sendProblem } from '../../../../utils/problem'
import type { BrandKitResponse } from '@contracts/schemas/merchant/brand-kit.schema'
import { isUuid } from '@domains/merchant/shared-kernel/uuid'
import { domainError } from '@shared/errors'

export default defineQueryEndpoint({
  async handler({ event, auth }) {
    const storeId = getRouterParam(event, 'storeId')
    if (!storeId || !isUuid(storeId)) return sendProblem(event, domainError('NOT_FOUND', 'store not found'))
    const result = await getContainer().queries.getBrandKit({
      actor: { type: 'user', id: auth.userId }, userId: auth.userId, storeId,
    })
    if (!result.ok) return sendProblem(event, result.error)
    const kit: BrandKitResponse = {
      store_id: result.value.storeId,
      name: result.value.name,
      logo_media_id: result.value.logoMediaId,
      palette: result.value.palette,
      typography: result.value.typography,
      voice: result.value.voice as BrandKitResponse['voice'],
    }
    return kit
  },
})
