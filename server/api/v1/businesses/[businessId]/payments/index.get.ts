/**
 * GET /api/v1/businesses/:businessId/payments (C10 Slice 3) — the till's status
 * for the workshop. `?sync=1` (the onboarding return path) refreshes the
 * capability snapshot from the provider first — idempotent with the
 * account.updated webhook in either order.
 */
import { getRouterParam, getQuery } from 'h3'
import { defineQueryEndpoint } from '../../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../../utils/container'
import { sendProblem } from '../../../../../utils/problem'
import { isUuid } from '@platform/uuid'
import { domainError } from '@shared/errors'

export default defineQueryEndpoint({
  async handler({ event, auth }) {
    const businessId = getRouterParam(event, 'businessId') ?? ''
    if (!isUuid(businessId)) return sendProblem(event, domainError('NOT_FOUND', 'not found'))
    const c = getContainer()
    const access = await c.deps.uow.withTransaction((tx) =>
      c.commerce.deps.merchantAccess.resolveAccess(tx, auth.userId, businessId))
    if (!access.ok) return sendProblem(event, domainError('NOT_FOUND', 'not found'))

    let profile = await c.deps.uow.withTransaction((tx) => c.payments.service.getPaymentProfile(tx, businessId))
    if (profile?.provider_account && getQuery(event).sync === '1') {
      // the onboarding return: read the provider's truth, land it in the snapshot
      const state = await c.payments.boundary.connectReadAccount(profile.provider_account)
      await c.deps.uow.withTransaction((tx) =>
        c.payments.service.applyAccountSnapshot(tx, { accountId: profile!.provider_account!, state }))
      profile = await c.deps.uow.withTransaction((tx) => c.payments.service.getPaymentProfile(tx, businessId))
    }
    return {
      onboarding_state: profile?.onboarding_state ?? 'none',
      charges_enabled: profile?.charges_enabled ?? false,
      payouts_enabled: profile?.payouts_enabled ?? false,
      provider: c.payments.provider,
    }
  },
})
