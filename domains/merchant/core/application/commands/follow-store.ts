/**
 * Follow/unfollow a store (Release 0.4) — the visitor half of the merchant's audience.
 * A 'guest' actor toggle with the same discipline as deal engagement: UNIQUE(store_id,
 * visitor_id) is the idempotency guard, events only on detected change, audited to the
 * followed business. Only LIVE stores can be followed (the same conjunction the public
 * storefront enforces — following is meaningless for a store the world can't see).
 */
import { type Result, ok, err } from '../../../../../shared/result'
import { domainError, type DomainError } from '../../../../../shared/errors'
import { uuidv7 } from '../../../shared-kernel/uuid'
import type { Actor } from '../../../shared-kernel/actor'
import { asClient } from '../../../../../platform/db'
import { EVENT, makeEvent } from '../../domain/events'
import type { KernelDeps } from '../deps'

export interface FollowStoreInput {
  storeHandle: string
  visitorId: string
  requestContext?: Record<string, unknown>
}

export function followStoreCommand(deps: KernelDeps) {
  return async (input: FollowStoreInput): Promise<Result<{ active: boolean; count: number }, DomainError>> => {
    const actor: Actor = { type: 'guest', id: input.visitorId }
    return deps.uow.withTransaction(async (tx) => {
      const client = asClient(tx)
      // live-store resolution — identical conditions to the public storefront read
      const { rows: stores } = await client.query<{ id: string; business_id: string }>(
        `SELECT id, business_id FROM stores
         WHERE handle = $1 AND status = 'live' AND enforcement_hold = 'none' AND deleted_at IS NULL`,
        [input.storeHandle.toLowerCase()])
      const store = stores[0]
      if (!store) return err(domainError('NOT_FOUND', 'this store does not exist'))

      const { rows: removed } = await client.query(
        `DELETE FROM store_follows WHERE store_id = $1 AND visitor_id = $2 RETURNING id`,
        [store.id, input.visitorId])

      let active: boolean
      let changed = true
      if (removed.length > 0) {
        active = false
      } else {
        const { rows: inserted } = await client.query(
          `INSERT INTO store_follows (id, store_id, business_id, visitor_id) VALUES ($1, $2, $3, $4)
           ON CONFLICT (store_id, visitor_id) DO NOTHING RETURNING id`,
          [uuidv7(), store.id, store.business_id, input.visitorId])
        active = true
        changed = inserted.length > 0
      }

      if (changed) {
        await deps.eventStore.append(tx, [makeEvent(
          active ? EVENT.STORE_FOLLOWED : EVENT.STORE_UNFOLLOWED,
          { type: 'store', id: store.id },
          store.business_id,
          actor,
          { store_id: store.id, business_id: store.business_id, visitor_id: input.visitorId },
        )])
        await deps.audit.record(tx, {
          businessId: store.business_id, actor, command: 'merchant.store.follow',
          sensitivity: 'normal', target: { type: 'store', id: store.id },
          afterDigest: { active }, context: input.requestContext,
        })
      }

      const { rows: counted } = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM store_follows WHERE store_id = $1`, [store.id])
      return ok({ active, count: Number(counted[0]!.n) })
    })
  }
}
