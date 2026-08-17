/**
 * POST /api/v1/ops/stores/:storeId/release (C12-2) — the mirror of hold.
 * Lifts ONLY an operator-placed 'under_review' hold. A 'suspended' hold
 * belongs to the standing-consequence policy (business standing) and is
 * deliberately NOT liftable here — this command must never silently broaden
 * or narrow another mechanism's meaning.
 */
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineCommandEndpoint } from '../../../../../utils/define-command-endpoint'
import { getContainer } from '../../../../../utils/container'
import { isOperator } from '../../../../../utils/ops'
import { isUuid, uuidv7 } from '@platform/uuid'
import { asClient } from '@platform/db'
import { journalLetter } from '@platform/mail-journal'
import { ok, err, type Result } from '@shared/result'
import { domainError, type DomainError } from '@shared/errors'

export default defineCommandEndpoint({
  command: 'ops.store.release',
  schema: z.object({ reason: z.string().min(1).max(500) }).strict(),
  successStatus: 200,
  async handler({ event, auth, body }): Promise<Result<{ released: true }, DomainError>> {
    if (!isOperator(auth.userId)) return err(domainError('NOT_FOUND', 'not found'))
    if (!auth.stepUpVerified) return err(domainError('STEP_UP_REQUIRED', 'confirm it is you before an enforcement act'))
    const storeId = getRouterParam(event, 'storeId') ?? ''
    if (!isUuid(storeId)) return err(domainError('NOT_FOUND', 'not found'))
    const c = getContainer()
    return c.deps.uow.withTransaction(async (tx): Promise<Result<{ released: true }, DomainError>> => {
      const client = asClient(tx)
      const { rows } = await client.query<{ business_id: string; name: string; enforcement_hold: string }>(
        `SELECT business_id, name, enforcement_hold FROM stores WHERE id = $1 AND deleted_at IS NULL`, [storeId])
      const store = rows[0]
      if (!store) return err(domainError('NOT_FOUND', 'not found'))
      if (store.enforcement_hold !== 'under_review') {
        return err(domainError('CONFLICT', store.enforcement_hold === 'none'
          ? 'nothing is held here'
          : 'this hold belongs to the standing policy — it lifts through remediation, not this door'))
      }
      await client.query(`UPDATE stores SET enforcement_hold = 'none', updated_at = now() WHERE id = $1`, [storeId])
      await c.audit.record(tx, {
        businessId: store.business_id, actor: { type: 'admin', id: auth.userId }, command: 'ops.store.release',
        sensitivity: 'sensitive', target: { type: 'store', id: storeId },
        afterDigest: { reason: body.reason, hold: 'none' },
      })
      const { rows: owner } = await client.query<{ email: string | null }>(
        `SELECT u.email FROM users u
         JOIN staff_memberships sm ON sm.principal_type = 'user' AND sm.principal_id = u.id
         WHERE sm.business_id = $1 AND 'owner' = ANY(sm.roles) AND sm.status = 'active' LIMIT 1`,
        [store.business_id])
      if (owner[0]?.email) {
        await journalLetter(tx, {
          consumer: 'ops.store-release', dedupRef: uuidv7(), to: owner[0].email,
          subject: `${store.name} is back on the street`,
          body: `The review is finished and your shop is visible again — storefront, checkout, everything, exactly as you left it.\n\n` +
            `Nothing to do. Thank you for the patience.`,
          critical: true,
        })
      }
      return ok({ released: true })
    })
  },
})
