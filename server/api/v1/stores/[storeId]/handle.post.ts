/**
 * POST /api/v1/stores/:storeId/handle — SV-2: change the store's address on DOF.
 * Owner-only + fresh step-up (enforced by the command spec). `sensitivity: 'sensitive'`
 * here so denied attempts are audited too — handle changes on aged stores are a classic
 * account-takeover signature (ADR §11 §591). Tight rate limit for the same reason.
 */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { isUuid } from '@domains/merchant/shared-kernel/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'merchant.store.change_handle',
  schema: z.object({ handle: z.string().min(1).max(40) }).strict(),
  successStatus: 200,
  sensitivity: 'sensitive',
  rateLimit: { limit: 5, windowSeconds: 3600 },
  async handler({ event, auth, body, requestContext }): Promise<Result<{ handle: string }, DomainError>> {
    const storeId = getRouterParam(event, 'storeId')
    if (!storeId || !isUuid(storeId)) return err(domainError('NOT_FOUND', 'store not found'))
    const r = await getContainer().commands.changeHandle({
      actor: { type: 'user', id: auth.userId }, userId: auth.userId, storeId,
      handle: body.handle, stepUpVerified: auth.stepUpVerified, requestContext,
    })
    if (!r.ok) return err(r.error)
    const c = getContainer(); const d = c.dispatcher.dispatchPending().catch(() => {})
    if (typeof event.waitUntil === 'function') event.waitUntil(d)
    return ok({ handle: r.value.handle })
  },
})
