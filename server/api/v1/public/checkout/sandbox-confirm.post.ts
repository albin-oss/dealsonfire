/**
 * POST /api/v1/public/checkout/sandbox-confirm (C10 Slice 2 — DEV ONLY).
 * The sandbox twin's "buyer's browser": confirms (or fails) a sandbox intent so
 * the full Element convergence machinery can be driven end to end without Stripe.
 * Refuses to exist in production or when the live provider is Stripe.
 */
import { z } from 'zod'
import { definePublicEndpoint } from '../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../utils/container'
import { getServerConfig } from '../../../../utils/config'
import { getVisitorId } from '../../../../utils/visitor'
import { SandboxProviderTwin } from '@domains/payments/application/payments'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'checkout.sandbox-confirm',
  schema: z.object({ attempt_key: z.string().uuid(), outcome: z.enum(['authorized', 'failed']).optional() }),
  rateLimit: { limit: 30, windowSeconds: 60 },
  async handler({ event, body }): Promise<Result<{ confirmed: boolean }, DomainError>> {
    const c = getContainer()
    if (getServerConfig().isProduction || c.payments.provider !== 'sandbox') {
      return err(domainError('NOT_FOUND', 'not found'))
    }
    const buyerId = getVisitorId(event)
    if (!buyerId) return err(domainError('NOT_FOUND', 'this checkout does not exist'))
    const { rows } = await c.pool.query<{ provider_ref: string | null }>(
      `SELECT i.provider_ref FROM orders o JOIN payment_intents i ON i.attempt_key = o.attempt_key
       WHERE o.attempt_key = $1 AND o.buyer_id = $2`, [body.attempt_key, buyerId])
    if (!rows[0]?.provider_ref) return err(domainError('NOT_FOUND', 'this checkout does not exist'))
    const twin = c.payments.providerInstance
    if (!(twin instanceof SandboxProviderTwin)) return err(domainError('NOT_FOUND', 'not found'))
    twin.confirmClientSide(rows[0].provider_ref, body.outcome ?? 'authorized')
    return ok({ confirmed: true })
  },
})
