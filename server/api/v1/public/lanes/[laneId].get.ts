/** GET /api/v1/public/lanes/:laneId (LS-3) — one door, deterministic contents, newest first. */
import { z } from 'zod'
import { getRouterParam, setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../utils/container'
import type { LaneContents } from '../../../../utils/lanes'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'public.lane',
  schema: z.object({}),
  rateLimit: { limit: 120, windowSeconds: 60 },
  async handler({ event }): Promise<Result<LaneContents, DomainError>> {
    const id = getRouterParam(event, 'laneId') ?? ''
    if (!/^[a-z0-9-]{2,40}$/.test(id)) return err(domainError('NOT_FOUND', 'no such lane'))
    const contents = await getContainer().engagement.laneContents(id)
    if (!contents) return err(domainError('NOT_FOUND', 'no such lane'))
    setResponseHeader(event, 'Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=120')
    return ok(contents)
  },
})
