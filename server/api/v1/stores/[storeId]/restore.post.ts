/** POST /api/v1/stores/:storeId/restore — SV-1 store lifecycle (ADR §7). Owner + step-up. */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { isUuid } from '@domains/merchant/shared-kernel/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'merchant.store.restore',
  schema: z.object({}).strict(),
  successStatus: 200,
  rateLimit: { limit: 30, windowSeconds: 3600 },
  async handler({ event, auth, requestContext }): Promise<Result<{ status: string; restore_days_left: number | null }, DomainError>> {
    const storeId = getRouterParam(event, 'storeId')
    if (!storeId || !isUuid(storeId)) return err(domainError('NOT_FOUND', 'store not found'))
    const r = await getContainer().commands.restoreStore({
      actor: { type: 'user', id: auth.userId }, userId: auth.userId, storeId,
      stepUpVerified: auth.stepUpVerified, requestContext,
    })
    if (!r.ok) return err(r.error)
    const c = getContainer(); const d = c.dispatcher.dispatchPending().catch(() => {})
    if (typeof event.waitUntil === 'function') event.waitUntil(d)
    return ok({ status: r.value.status, restore_days_left: r.value.restoreDaysLeft })
  },
})
