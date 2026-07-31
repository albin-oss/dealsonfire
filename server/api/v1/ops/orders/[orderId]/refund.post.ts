/**
 * POST /api/v1/ops/orders/:orderId/refund (C9) — the failed-refund retry and
 * the exceptional cancellation, through the ONE money primitive: bounded by the
 * schema (refunded ≤ captured, no operator can overdraw), idempotent per
 * cause_key (a retried retry changes nothing), fully audited. Support fixes
 * money HERE — never in SQL.
 */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../../utils/container'
import { isOperator } from '../../../../../utils/ops'
import { isUuid, uuidv7 } from '@platform/uuid'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'ops.order.refund',
  schema: z.object({
    amount_minor: z.number().int().positive(),
    cause_key: z.string().min(1).max(120),
    reason: z.string().min(1).max(500),
  }).strict(),
  successStatus: 200,
  async handler({ event, auth, body }): Promise<Result<{ refunded_minor: number }, DomainError>> {
    if (!isOperator(auth.userId)) return err(domainError('NOT_FOUND', 'not found'))
    const orderId = getRouterParam(event, 'orderId') ?? ''
    if (!isUuid(orderId)) return err(domainError('NOT_FOUND', 'not found'))
    const c = getContainer()
    const prepared = await c.deps.uow.withTransaction(async (tx): Promise<Result<{ refunded_minor: number; op_id?: string | null }, DomainError>> => {
      const { rows } = await c.pool.query<{ currency: string }>(`SELECT currency FROM orders WHERE id = $1`, [orderId])
      if (!rows[0]) return err(domainError('NOT_FOUND', 'not found'))
      // §7: journal (bounded, cause-keyed); the boundary executes after commit
      const refunded = await c.payments.service.prepareRefund(tx, {
        orderId, amountMinor: body.amount_minor,
        causeKey: `ops:${body.cause_key}`,
        cause: { kind: 'ops_refund', reason: body.reason, operator: auth.userId },
      })
      if (!refunded.ok) return err(domainError('CONFLICT', refunded.detail))
      await c.audit.record(tx, {
        businessId: null, actor: { type: 'admin', id: auth.userId }, command: 'ops.order.refund',
        sensitivity: 'sensitive', target: { type: 'order', id: orderId },
        afterDigest: { amount_minor: body.amount_minor, cause_key: body.cause_key, reason: body.reason },
      })
      await c.pool.query(
        `INSERT INTO order_timeline (id, order_id, entry_type, message, actor) VALUES ($1, $2, 'refund', $3, $4)`,
        [uuidv7(), orderId, JSON.stringify({
          amount_minor: body.amount_minor, currency: rows[0].currency,
          text: 'Support stepped in — a refund is on its way back to you.',
        }), JSON.stringify({ type: 'admin', id: auth.userId })])
      return ok({ refunded_minor: body.amount_minor, op_id: refunded.opId })
    })
    // §7: the audited decision committed; the money executes at the boundary now
    if (prepared.ok && prepared.value.op_id) {
      const driven = await c.payments.boundary.drive(prepared.value.op_id)
        .catch((error) => ({ settled: false as const, outcome: 'retrying' as const, detail: (error as Error).message }))
      if (!driven.settled && driven.outcome === 'retrying') {
        // ops deserves the unvarnished truth: journaled, not yet landed, driver retrying
        return err(domainError('CONFLICT', `The provider refused just now (${'detail' in driven ? driven.detail : 'unknown'}) — the refund is journaled and the driver keeps retrying; check /ops/alarms if it persists.`))
      }
    }
    if (prepared.ok) {
      const { op_id: _omit, ...response } = prepared.value
      return ok(response)
    }
    return prepared
  },
})
