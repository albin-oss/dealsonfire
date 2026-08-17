/**
 * POST /api/v1/ops/stores/:storeId/hold (C12-2) — the enforcement machinery's
 * first reachable emitter. A held store follows the EXISTING semantics exactly
 * (binding, per the readiness review): it vanishes behind the masked-404 gates
 * and its till closes through the same reads — nothing else changes. No payout
 * freeze (that is Payments' risk state), no reputation effect, no buyer-facing
 * copy. Lift is the mirror.
 *
 * Operator-only (masked 404 otherwise) · STEP-UP required (an enforcement act
 * is a sensitive act) · reason required · audited sensitive · open reports for
 * the store resolve with the decision · the maker hears it as a letter.
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
  command: 'ops.store.hold',
  schema: z.object({
    reason: z.string().min(1).max(500),
    report_id: z.string().uuid().optional(),
  }).strict(),
  successStatus: 200,
  async handler({ event, auth, body }): Promise<Result<{ held: true }, DomainError>> {
    if (!isOperator(auth.userId)) return err(domainError('NOT_FOUND', 'not found'))
    if (!auth.stepUpVerified) return err(domainError('STEP_UP_REQUIRED', 'confirm it is you before an enforcement act'))
    const storeId = getRouterParam(event, 'storeId') ?? ''
    if (!isUuid(storeId)) return err(domainError('NOT_FOUND', 'not found'))
    const c = getContainer()
    return c.deps.uow.withTransaction(async (tx): Promise<Result<{ held: true }, DomainError>> => {
      const client = asClient(tx)
      const { rows } = await client.query<{ business_id: string; name: string; enforcement_hold: string }>(
        `SELECT business_id, name, enforcement_hold FROM stores WHERE id = $1 AND deleted_at IS NULL`, [storeId])
      const store = rows[0]
      if (!store) return err(domainError('NOT_FOUND', 'not found'))
      if (store.enforcement_hold !== 'none') {
        return err(domainError('CONFLICT', `already held (${store.enforcement_hold}) — lifting first is the honest path`))
      }
      await client.query(`UPDATE stores SET enforcement_hold = 'under_review', updated_at = now() WHERE id = $1`, [storeId])
      await client.query(
        `UPDATE abuse_reports SET state = 'resolved', resolved_at = now(), resolved_by = $2, resolution = $3
         WHERE subject_type = 'store' AND subject_ref = $1 AND state = 'open'`,
        [storeId, auth.userId, `held: ${body.reason}`])
      await c.audit.record(tx, {
        businessId: store.business_id, actor: { type: 'admin', id: auth.userId }, command: 'ops.store.hold',
        sensitivity: 'sensitive', target: { type: 'store', id: storeId },
        afterDigest: { reason: body.reason, report_id: body.report_id ?? null, hold: 'under_review' },
      })
      // the maker hears it plainly, in the workshop voice — one fact, one door
      const { rows: owner } = await client.query<{ email: string | null }>(
        `SELECT u.email FROM users u
         JOIN staff_memberships sm ON sm.principal_type = 'user' AND sm.principal_id = u.id
         WHERE sm.business_id = $1 AND 'owner' = ANY(sm.roles) AND sm.status = 'active' LIMIT 1`,
        [store.business_id])
      if (owner[0]?.email) {
        await journalLetter(tx, {
          consumer: 'ops.store-hold', dedupRef: uuidv7(), to: owner[0].email,
          subject: `${store.name} is paused for a review`,
          body: `Your shop is temporarily out of view while we look into a report.\n\n` +
            `What this means: your storefront and checkout are paused; your products, story, and money are untouched, and payouts continue as normal.\n\n` +
            `What happens next: a human finishes the review — most reviews end with the shop simply returning. If we need anything from you, we'll write.\n\n` +
            `You can reply to support any time.`,
          critical: true,
        })
      }
      return ok({ held: true })
    })
  },
})
