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


export interface ToggleInput {
  dealId: string
  deal: EngageableDeal
  visitorId: string
  requestContext?: Record<string, unknown>
}

/** Subject-agnostic toggle config: deals and sparks share one engagement discipline. */
export interface EngagementSubject {
  table: string
  subjectColumn: string
  targetType: string
  command: string
  /** Builds the domain event; `active` is the toggle's outcome (on = true). */
  makeEvent: (
    payload: { subjectId: string; businessId: string; visitorId: string },
    actor: Actor,
    active: boolean,
  ) => ReturnType<typeof makeDealEngagementEvent>
}

/**
 * One toggle for every engagement subject: present → remove, absent → add.
 * Concurrency-safe by the unique key (ON CONFLICT DO NOTHING → a lost race is a
 * silent no-change, no event). Runs in the CALLER's transaction — the composition
 * root resolves engageability and toggles atomically in one tx.
 */
export function toggleSubjectEngagementInTx(deps: CommerceDeps, subject: EngagementSubject, tx: Tx) {
  return async (input: { subjectId: string; businessId: string; visitorId: string; requestContext?: Record<string, unknown> }): Promise<Result<{ active: boolean; count: number }, DomainError>> => {
    const actor: Actor = { type: 'guest', id: input.visitorId }
    const client = asClient(tx)
    const { rows: removed } = await client.query(
      `DELETE FROM ${subject.table} WHERE ${subject.subjectColumn} = $1 AND visitor_id = $2 RETURNING id`,
      [input.subjectId, input.visitorId])

    let active: boolean
    let changed = true
    if (removed.length > 0) {
      active = false
    } else {
      const { rows: inserted } = await client.query(
        `INSERT INTO ${subject.table} (id, ${subject.subjectColumn}, business_id, visitor_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (${subject.subjectColumn}, visitor_id) DO NOTHING RETURNING id`,
        [uuidv7(), input.subjectId, input.businessId, input.visitorId])
      active = true
      changed = inserted.length > 0 // a lost race means the state was already there
    }

    if (changed) {
      await deps.eventStore.append(tx, [subject.makeEvent(
        { subjectId: input.subjectId, businessId: input.businessId, visitorId: input.visitorId },
        actor,
        active,
      )])
      await deps.audit.record(tx, {
        businessId: input.businessId, actor, command: subject.command,
        sensitivity: 'normal', target: { type: subject.targetType, id: input.subjectId },
        afterDigest: { active }, context: input.requestContext,
      })
    }

    const { rows: counted } = await client.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM ${subject.table} WHERE ${subject.subjectColumn} = $1`, [input.subjectId])
    return ok({ active, count: Number(counted[0]!.n) })
  }
}

const DEAL_SUBJECT: Record<EngagementKind, EngagementSubject> = {
  reaction: {
    table: 'deal_reactions', subjectColumn: 'deal_id', targetType: 'deal',
    command: 'commerce.deal.react',
    makeEvent: ({ subjectId, businessId, visitorId }, actor, active) =>
      makeDealEngagementEvent(
        active ? COMMERCE_EVENT.DEAL_REACTED : COMMERCE_EVENT.DEAL_UNREACTED,
        { deal_id: subjectId, business_id: businessId, visitor_id: visitorId },
        actor,
      ),
  },
  save: {
    table: 'deal_saves', subjectColumn: 'deal_id', targetType: 'deal',
    command: 'commerce.deal.save',
    makeEvent: ({ subjectId, businessId, visitorId }, actor, active) =>
      makeDealEngagementEvent(
        active ? COMMERCE_EVENT.DEAL_SAVED : COMMERCE_EVENT.DEAL_UNSAVED,
        { deal_id: subjectId, business_id: businessId, visitor_id: visitorId },
        actor,
      ),
  },
}

/** The deal-flavored toggle (Release 0.4 API, unchanged for callers). */
export function toggleEngagementInTx(deps: CommerceDeps, kind: EngagementKind, tx: Tx) {
  return async (input: ToggleInput): Promise<Result<{ active: boolean; count: number }, DomainError>> =>
    toggleSubjectEngagementInTx(deps, DEAL_SUBJECT[kind], tx)({
      subjectId: input.dealId,
      businessId: input.deal.businessId,
      visitorId: input.visitorId,
      requestContext: input.requestContext,
    })
}
