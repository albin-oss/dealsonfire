/** GET /api/v1/public/lanes (LS-3) — the street's doors, with honest counts. */
import { z } from 'zod'
import { setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../utils/container'
import type { LaneSummary } from '../../../../utils/lanes'
import { ok, type Result } from '@shared/result'
import { type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'public.lanes',
  schema: z.object({}),
  rateLimit: { limit: 120, windowSeconds: 60 },
  async handler({ event }): Promise<Result<{ lanes: LaneSummary[] }, DomainError>> {
    const lanes = await getContainer().engagement.laneSummaries()
    setResponseHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300')
    return ok({ lanes })
  },
})
