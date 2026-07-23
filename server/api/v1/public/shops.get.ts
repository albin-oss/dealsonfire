/** GET /api/v1/public/shops (Capability 02) — the directory: every live store, newest first. */
import { z } from 'zod'
import { setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../utils/define-public-endpoint'
import { getContainer } from '../../../utils/container'
import { ok, type Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'public.shops',
  schema: z.object({}),
  rateLimit: { limit: 120, windowSeconds: 60 },
  async handler({ event }): Promise<Result<{ items: unknown[] }, DomainError>> {
    const items = await getContainer().engagement.liveShops()
    setResponseHeader(event, 'Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300')
    return ok({ items })
  },
})
