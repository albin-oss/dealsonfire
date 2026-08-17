/**
 * POST /api/v1/public/report (C12-2 — the safety intake's front door).
 *
 * Anyone can say "something here is wrong": closed subject vocabulary, closed
 * reasons, bounded note (treated as sensitive — people paste PII into free
 * text no matter what the form says; the form solicits no contact details).
 * Reporter identity is the pseudonymous visitor id — uniform for everyone,
 * enumeration-proof by construction.
 *
 * Answers are deliberately information-free: {received:true} whether the
 * subject exists, whether this reporter already reported it (the unique key
 * absorbs duplicates silently), whatever. Nobody probes the street's shape
 * through the report door. One reporter cannot flood one subject; different
 * reporters on the same subject remain independent voices. The endpoint
 * shelters behind the DURABLE limiter (built first, by law).
 */
import { z } from 'zod'
import { definePublicEndpoint } from '../../../utils/define-public-endpoint'
import { getContainer } from '../../../utils/container'
import { getOrCreateVisitorId } from '../../../utils/visitor'
import { uuidv7 } from '@platform/uuid'
import { asClient } from '@platform/db'
import { ok, type Result } from '@shared/result'
import type { DomainError } from '@shared/errors'

export default definePublicEndpoint({
  name: 'public.report',
  rateLimit: { limit: 10, windowSeconds: 3600 },
  schema: z.object({
    subject_type: z.enum(['store', 'product', 'deal', 'spark', 'order']),
    subject_ref: z.string().uuid(),
    reason: z.enum(['counterfeit', 'scam', 'offensive', 'dangerous', 'stolen_content', 'never_arrived', 'other']),
    note: z.string().max(1000).optional(),
  }).strict(),
  successStatus: 200,
  async handler({ event, body }): Promise<Result<{ received: true }, DomainError>> {
    const reporterId = getOrCreateVisitorId(event)
    const c = getContainer()
    await c.deps.uow.withTransaction(async (tx) => {
      await asClient(tx).query(
        `INSERT INTO abuse_reports (id, subject_type, subject_ref, reason, note, reporter_id, reporter_kind)
         VALUES ($1, $2, $3, $4, $5, $6, 'visitor')
         ON CONFLICT (subject_type, subject_ref, reporter_id) DO NOTHING`,
        [uuidv7(), body.subject_type, body.subject_ref, body.reason, body.note ?? null, reporterId])
      await c.audit.record(tx, {
        businessId: null, actor: { type: 'guest', id: reporterId }, command: 'public.report',
        sensitivity: 'sensitive', target: { type: body.subject_type, id: body.subject_ref },
        afterDigest: { reason: body.reason },
      })
    })
    return ok({ received: true })
  },
})
