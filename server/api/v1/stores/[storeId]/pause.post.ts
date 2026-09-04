/** POST /api/v1/stores/:storeId/pause — Live → Paused (SV-1, ADR §7). Carries a reason. */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { isUuid } from '@domains/merchant/shared-kernel/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'merchant.store.pause',
  schema: z.object({
    reason: z.enum(['vacation', 'restocking', 'personal', 'other']).default('other'),
    back_on: z.string().max(80).optional(),
  }),
  successStatus: 200,
  rateLimit: { limit: 30, windowSeconds: 3600 },
  async handler({ event, auth, body, requestContext }): Promise<Result<{ status: string }, DomainError>> {
    const storeId = getRouterParam(event, 'storeId')
    if (!storeId || !isUuid(storeId)) return err(domainError('NOT_FOUND', 'store not found'))
    const r = await getContainer().commands.pauseStore({
      actor: { type: 'user', id: auth.userId }, userId: auth.userId, storeId,
      reason: body.reason ?? 'other', backOn: body.back_on ?? null,
      stepUpVerified: auth.stepUpVerified, requestContext,
    })
    if (!r.ok) return err(r.error)
    const c = getContainer(); const d = c.dispatcher.dispatchPending().catch(() => {})
    if (typeof event.waitUntil === 'function') event.waitUntil(d)
    return ok({ status: r.value.status })
  },
})
