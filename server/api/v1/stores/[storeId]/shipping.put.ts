/**
 * PUT /api/v1/stores/:storeId/shipping (C6) — the merchant's promise-making
 * settings: handling days (the ship-by promise source), flat rate, free-over,
 * pickup. Whole-value put (the Brand Kit idiom).
 */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../utils/container'
import { isUuid } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

type Out = { profile: { handling_days: number; flat_rate_minor: number; free_over_minor: number | null; pickup_enabled: boolean } }

export default defineCommandEndpoint({
  command: 'operations.shipping.profile',
  schema: z.object({
    handling_days: z.number().int().min(0).max(60),
    flat_rate_minor: z.number().int().min(0).max(100_000),
    free_over_minor: z.number().int().min(0).max(10_000_000).nullable(),
    pickup_enabled: z.boolean(),
  }).strict(),
  successStatus: 200,
  async handler({ event, auth, body }): Promise<Result<Out, DomainError>> {
    const storeId = getRouterParam(event, 'storeId') ?? ''
    if (!isUuid(storeId)) return err(domainError('NOT_FOUND', 'not found'))
    const c = getContainer()
    return c.deps.uow.withTransaction(async (tx): Promise<Result<Out, DomainError>> => {
      const { rows } = await c.pool.query<{ business_id: string }>(`SELECT business_id FROM stores WHERE id = $1`, [storeId])
      if (!rows[0]) return err(domainError('NOT_FOUND', 'not found'))
      const access = await c.commerce.deps.merchantAccess.resolveAccess(tx, auth.userId, rows[0].business_id)
      if (!access.ok) return err(domainError('NOT_FOUND', 'not found'))
      await c.operations.fulfillment.upsertProfile(tx, {
        businessId: rows[0].business_id, storeId,
        handlingDays: body.handling_days,
        flatRateMinor: body.flat_rate_minor,
        freeOverMinor: body.free_over_minor,
        pickupEnabled: body.pickup_enabled,
      })
      const profile = await c.operations.fulfillment.getOrDefaultProfile(tx, rows[0].business_id, storeId)
      return ok({ profile: { handling_days: profile.handling_days, flat_rate_minor: profile.flat_rate_minor, free_over_minor: profile.free_over_minor, pickup_enabled: profile.pickup_enabled } })
    })
  },
})
