/**
 * POST /api/v1/businesses/:businessId/payments/onboarding (C10 Slice 3) — the
 * walk to the bank teller's window: creates the connected account once
 * (idempotent per business) and answers with the HOSTED onboarding link.
 * Stripe asks the legal questions; DOF never sees the papers. §7 sequencing:
 * short tx → provider (no tx) → short tx.
 */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../../utils/container'
import { getServerConfig } from '../../../../../utils/config'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'payments.onboarding.start',
  schema: z.object({}).strict(),
  successStatus: 200,
  async handler({ auth, event }): Promise<Result<{ url: string }, DomainError>> {
    const businessId = getRouterParam(event, 'businessId') ?? ''
    if (!isUuid(businessId)) return err(domainError('NOT_FOUND', 'not found'))
    const c = getContainer()

    const access = await c.deps.uow.withTransaction(async (tx) => {
      const resolved = await c.commerce.deps.merchantAccess.resolveAccess(tx, auth.userId, businessId)
      if (!resolved.ok) return null
      return { profile: await c.payments.service.getPaymentProfile(tx, businessId) }
    })
    if (!access) return err(domainError('NOT_FOUND', 'not found'))

    let accountId = access.profile?.provider_account ?? null
    if (!accountId) {
      const { rows } = await c.pool.query<{ email: string | null }>(
        `SELECT u.email FROM users u
         JOIN staff_memberships m ON m.principal_id = u.id
         WHERE m.business_id = $1 AND m.principal_type = 'user' AND 'owner' = ANY(m.roles) AND m.status = 'active'
         LIMIT 1`, [businessId])
      const created = await c.payments.boundary.connectCreateAccount({ businessId, email: rows[0]?.email ?? null })
      accountId = created.accountId
      await c.deps.uow.withTransaction((tx) => c.payments.service.recordConnectedAccount(tx, businessId, accountId!))
    }

    const { appBaseUrl } = getServerConfig()
    const link = await c.payments.boundary.connectOnboardingLink(accountId, {
      refreshUrl: `${appBaseUrl}/settings?stripe=refresh`,
      returnUrl: `${appBaseUrl}/settings?stripe=return`,
    })
    return ok({ url: link.url })
  },
})
