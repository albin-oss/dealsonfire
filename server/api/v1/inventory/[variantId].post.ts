/**
 * POST /api/v1/inventory/:variantId (SV-3) — the merchant sets or corrects stock, and by
 * doing so turns tracking on. `mode: 'set'` establishes an absolute count (a stocktake);
 * `mode: 'delta'` adjusts by ±n. Reason-coded on the append-only ledger with the acting
 * merchant. Gated by `catalog.inventory.write` (owner/manager/staff — NOT support/AI), and
 * the variant must belong to the caller's business (cross-tenant writes masked). The
 * quantity can never drop below units held by in-progress checkouts (the aggregate guards).
 */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../utils/define-command-endpoint'
import { getContainer } from '../../../utils/container'
import { isUuid } from '@domains/merchant/shared-kernel/uuid'
import { grantFor, grantSatisfies } from '@domains/merchant/shared-kernel/permissions'
import { ensureGhostLocationInTx } from '@domains/operations/locations/application/commands/ensure-ghost-location'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'operations.inventory.adjust',
  schema: z.object({
    business_id: z.string().uuid(),
    mode: z.enum(['set', 'delta']),
    quantity: z.number().int().gte(-1_000_000).lte(1_000_000),
    note: z.string().max(140).nullable().optional(),
  }).strict(),
  successStatus: 200,
  rateLimit: { limit: 120, windowSeconds: 3600 },
  async handler({ event, auth, body, requestContext }): Promise<Result<{ variant_id: string; on_hand: number; reserved: number }, DomainError>> {
    const variantId = getRouterParam(event, 'variantId')
    if (!variantId || !isUuid(variantId)) return err(domainError('NOT_FOUND', 'not found'))
    const c = getContainer()
    return c.deps.uow.withTransaction(async (tx) => {
      const access = await c.commerce.deps.merchantAccess.resolveAccess(tx, auth.userId, body.business_id)
      if (!access.ok) return err(domainError('NOT_FOUND', 'not found')) // masked
      if (!grantSatisfies(grantFor(access.value.membership.roles, 'catalog.inventory.write'), 'full')) {
        return err(domainError('PERMISSION_DENIED', 'you cannot change stock'))
      }
      // the variant must belong to this business (cross-tenant writes masked as not-found)
      const { rows } = await c.pool.query<{ one: number }>(
        `SELECT 1 AS one FROM product_variants WHERE id = $1 AND business_id = $2`, [variantId, body.business_id])
      if (!rows[0]) return err(domainError('NOT_FOUND', 'not found'))

      const ghost = await ensureGhostLocationInTx(c.operations.deps, tx, { businessId: body.business_id })
      if (!ghost.ok) return err(ghost.error)

      const actor = { type: 'user' as const, id: auth.userId }
      const result = await c.operations.stock.adjustStock(tx, {
        businessId: body.business_id, variantId, locationId: ghost.value.location_id,
        mode: body.mode, quantity: body.quantity, actor, note: body.note ?? null,
      })
      if (!result.ok) return err(domainError('CONFLICT', result.message))

      await c.operations.deps.audit.record(tx, {
        businessId: body.business_id, actor, command: 'operations.inventory.adjust',
        sensitivity: 'normal', target: { type: 'variant', id: variantId },
        afterDigest: { mode: body.mode, quantity: body.quantity, on_hand: result.onHand }, context: requestContext,
      })
      return ok({ variant_id: variantId, on_hand: result.onHand, reserved: result.reserved })
    })
  },
})
