/**
 * GET /api/v1/public/stores/:handle/shipping (C6) — the store's shipping terms:
 * what a buyer needs before checkout (rate, free-over, pickup, handling days).
 * Public data (it prices every quote); cacheable; live stores only (V6 mask).
 */
import { z } from 'zod'
import { getRouterParam, setResponseHeader } from 'h3'
import { definePublicEndpoint } from '../../../../../utils/define-public-endpoint'
import { getContainer } from '../../../../../utils/container'
import { RETURN_WINDOW_DAYS } from '@domains/operations/returns/application/returns'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'public.store-shipping',
  schema: z.object({}),
  rateLimit: { limit: 120, windowSeconds: 60 },
  async handler({ event }): Promise<Result<{
    handling_days: number; flat_rate_minor: number; free_over_minor: number | null; pickup_enabled: boolean
    return_window_days: number
  }, DomainError>> {
    const handle = (getRouterParam(event, 'handle') ?? '').toLowerCase()
    const c = getContainer()
    const result = await c.deps.uow.withTransaction(async (tx) => {
      const { rows } = await c.pool.query<{ id: string; business_id: string }>(
        `SELECT id, business_id FROM stores WHERE handle = $1 AND status = 'live' AND enforcement_hold = 'none' AND deleted_at IS NULL`, [handle])
      if (!rows[0]) return null
      return c.operations.fulfillment.getOrDefaultProfile(tx, rows[0].business_id, rows[0].id)
    })
    if (!result) return err(domainError('NOT_FOUND', 'this store does not exist'))
    setResponseHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300')
    return ok({
      handling_days: result.handling_days,
      flat_rate_minor: result.flat_rate_minor,
      free_over_minor: result.free_over_minor,
      pickup_enabled: result.pickup_enabled,
      // Returns is a platform promise, not a per-store field — derived from the one
      // authoritative constant so merchant-facing copy can never contradict enforcement.
      return_window_days: RETURN_WINDOW_DAYS,
    })
  },
})
