/** GET /api/v1/handles/:handle/availability (PROMPT-008 Ignite). Real-time handle check. */
import { getRouterParam } from 'h3'
import { defineQueryEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import type { HandleAvailabilityResponse } from '@contracts/schemas/merchant/store.schema'

export default defineQueryEndpoint({
  async handler({ event }): Promise<HandleAvailabilityResponse> {
    const handle = getRouterParam(event, 'handle') ?? ''
    return getContainer().queries.handleAvailability(handle)
  },
})
