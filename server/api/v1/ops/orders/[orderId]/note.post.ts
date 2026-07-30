/**
 * POST /api/v1/ops/orders/:orderId/note (C9) — the manual timeline note and the
 * alarm acknowledgement, one audited pen: support writes what happened (or that
 * a human has seen an alarm, ack: true) straight into the order's story.
 * Notes marked internal stay off the buyer page (the timeline reader filters).
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
  command: 'ops.order.note',
  schema: z.object({
    text: z.string().min(1).max(1000),
    ack: z.boolean().optional(),
    internal: z.boolean().optional(),
  }).strict(),
  successStatus: 200,
  async handler({ event, auth, body }): Promise<Result<{ noted: true }, DomainError>> {
    if (!isOperator(auth.userId)) return err(domainError('NOT_FOUND', 'not found'))
    const orderId = getRouterParam(event, 'orderId') ?? ''
    if (!isUuid(orderId)) return err(domainError('NOT_FOUND', 'not found'))
    const c = getContainer()
    return c.deps.uow.withTransaction(async (tx): Promise<Result<{ noted: true }, DomainError>> => {
      const { rows } = await c.pool.query(`SELECT id FROM orders WHERE id = $1`, [orderId])
      if (!rows[0]) return err(domainError('NOT_FOUND', 'not found'))
      await c.pool.query(
        `INSERT INTO order_timeline (id, order_id, entry_type, message, actor) VALUES ($1, $2, 'note', $3, $4)`,
        [uuidv7(), orderId,
          JSON.stringify({ text: body.text, ops: true, ack: body.ack ?? false, internal: body.internal ?? true }),
          JSON.stringify({ type: 'admin', id: auth.userId })])
      await c.audit.record(tx, {
        businessId: null, actor: { type: 'admin', id: auth.userId }, command: 'ops.order.note',
        sensitivity: 'normal', target: { type: 'order', id: orderId },
        afterDigest: { ack: body.ack ?? false, internal: body.internal ?? true },
      })
      return ok({ noted: true })
    })
  },
})
