/**
 * Deal engagement (Release 0.4) — the customer half of the network loop. Visitors are
 * first-class 'guest' actors (a long-lived pseudonymous cookie identity); reacting and
 * saving are idempotent toggles: the UNIQUE(deal_id, visitor_id) key is the idempotency
 * guard, events fire only on detected change (the V4 idiom), every change is audited to
 * the deal's business. Engageability = the deal's full public conjunction ON COMMERCE
 * TERMS (deal published ∧ listing published ∧ product alive); store liveness is the
 * caller's half (composition root) — same 404-oracle discipline as the public reads.
 */
import { type Result, ok } from '../../../../shared/result'
import type { DomainError } from '../../../../shared/errors'
import { uuidv7 } from '../../../../platform/uuid'
import type { Tx } from '../../../../platform/types'
import { asClient } from '../../../../platform/db'
import type { Actor } from '../../../merchant/shared-kernel/actor'
import { COMMERCE_EVENT, makeDealEngagementEvent } from '../domain/events'
import type { CommerceDeps } from './ports'

export interface EngageableDeal { businessId: string; channelId: string }

/** The commerce terms of the deal conjunction; null = not engageable (mask upstream). */
export async function resolveEngageableDeal(tx: Tx, dealId: string): Promise<EngageableDeal | null> {
  const { rows } = await asClient(tx).query<{ business_id: string; channel_id: string }>(
    `SELECT d.business_id, d.channel_id
     FROM deals d
     JOIN listings l ON l.product_id = d.product_id AND l.channel_id = d.channel_id AND l.status = 'published'
     JOIN products p ON p.id = d.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
     WHERE d.id = $1 AND d.status = 'published'`,
    [dealId])
  return rows[0] ? { businessId: rows[0].business_id, channelId: rows[0].channel_id } : null
}

type EngagementKind = 'reaction' | 'save'
const TABLE: Record<EngagementKind, string> = { reaction: 'deal_reactions', save: 'deal_saves' }
const ON_EVENT: Record<EngagementKind, string> = { reaction: COMMERCE_EVENT.DEAL_REACTED, save: COMMERCE_EVENT.DEAL_SAVED }
const OFF_EVENT: Record<EngagementKind, string> = { reaction: COMMERCE_EVENT.DEAL_UNREACTED, save: COMMERCE_EVENT.DEAL_UNSAVED }
const COMMAND: Record<EngagementKind, string> = { reaction: 'commerce.deal.react', save: 'commerce.deal.save' }

export interface ToggleInput {
  dealId: string
  deal: EngageableDeal
  visitorId: string
  requestContext?: Record<string, unknown>
}

/**
 * One toggle for both kinds: present → remove, absent → add. Concurrency-safe by the
 * unique key (ON CONFLICT DO NOTHING → a lost race is a silent no-change, no event).
 * Runs in the CALLER's transaction — the composition root resolves engageability
 * (commerce terms + store liveness) and toggles atomically in one tx.
 */
export function toggleEngagementInTx(deps: CommerceDeps, kind: EngagementKind, tx: Tx) {
  return async (input: ToggleInput): Promise<Result<{ active: boolean; count: number }, DomainError>> => {
    const table = TABLE[kind]
    const actor: Actor = { type: 'guest', id: input.visitorId }
    {
      const client = asClient(tx)
      const { rows: removed } = await client.query(
        `DELETE FROM ${table} WHERE deal_id = $1 AND visitor_id = $2 RETURNING id`,
        [input.dealId, input.visitorId])

      let active: boolean
      let changed = true
      if (removed.length > 0) {
        active = false
      } else {
        const { rows: inserted } = await client.query(
          `INSERT INTO ${table} (id, deal_id, business_id, visitor_id) VALUES ($1, $2, $3, $4)
           ON CONFLICT (deal_id, visitor_id) DO NOTHING RETURNING id`,
          [uuidv7(), input.dealId, input.deal.businessId, input.visitorId])
        active = true
        changed = inserted.length > 0 // a lost race means the state was already there
      }

      if (changed) {
        await deps.eventStore.append(tx, [makeDealEngagementEvent(
          active ? ON_EVENT[kind] : OFF_EVENT[kind],
          { deal_id: input.dealId, business_id: input.deal.businessId, visitor_id: input.visitorId },
          actor,
        )])
        await deps.audit.record(tx, {
          businessId: input.deal.businessId, actor, command: COMMAND[kind],
          sensitivity: 'normal', target: { type: 'deal', id: input.dealId },
          afterDigest: { active }, context: input.requestContext,
        })
      }

      const { rows: counted } = await client.query<{ n: string }>(
        `SELECT count(*)::int AS n FROM ${table} WHERE deal_id = $1`, [input.dealId])
      return ok({ active, count: Number(counted[0]!.n) })
    }
  }
}
