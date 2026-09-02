/**
 * GET /api/v1/public/threads?subject_type=&subject_id= (LS-5) — the explainable
 * next doors for one thing: the maker's voice, and nearby-on-the-street.
 */
import { z } from 'zod'
import { getQuery, setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../utils/define-public-endpoint'
import { getContainer } from '../../../utils/container'
import type { Threads } from '../../../utils/threads'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'
import { isUuid } from '@platform/uuid'

export default definePublicEndpoint({
  name: 'public.threads',
  schema: z.object({}),
  rateLimit: { limit: 120, windowSeconds: 60 },
  async handler({ event }): Promise<Result<Threads, DomainError>> {
    const raw = getQuery(event)
    const subjectType = String(raw.subject_type ?? '')
    const subjectId = String(raw.subject_id ?? '')
    if (!['product', 'deal'].includes(subjectType) || !isUuid(subjectId)) {
      return err(domainError('VALIDATION_FAILED', 'threads need a product or deal subject'))
    }
    const threads = await getContainer().engagement.threadsFor(subjectType as 'product' | 'deal', subjectId)
    setResponseHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300')
    return ok(threads)
  },
})
