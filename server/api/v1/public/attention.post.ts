/**
 * POST /api/v1/public/attention (LS-1) — the street's attention beacon.
 *
 * A batch of passive attention facts: impressions, views, searches, search
 * clicks. Laws it lives under:
 *  - NEVER mints identity: visitor_id is read from an already-existing cookie
 *    (engagement-born) or the rows land anonymous — glances, never people
 *  - subjects are existence-validated per batch; fabricated ids are silently
 *    dropped (an attacker learns nothing; honest clients lose nothing)
 *  - explicit acts (follow/save/fire/cart/purchase) are NOT accepted here —
 *    they have their own doors and are never recorded twice
 *  - the response is a bare count; this endpoint is not an oracle
 */
import { z } from 'zod'
import { definePublicEndpoint } from '../../../utils/define-public-endpoint'
import { getContainer } from '../../../utils/container'
import { getVisitorId } from '../../../utils/visitor'
import { uuidv7 } from '@platform/uuid'
import { laneById } from '@contracts/discovery/lanes'
import { ok, type Result } from '@shared/result'
import { type DomainError } from '@shared/errors'

const subjectEvent = z.object({
  type: z.enum(['feed_impression', 'store_view', 'product_view', 'deal_view', 'spark_view']),
  subject_type: z.enum(['store', 'product', 'deal', 'spark']),
  subject_id: z.string().uuid(),
  source: z.enum(['home', 'shops', 'storefront', 'search', 'direct']),
})
const searchEvent = z.object({
  type: z.literal('search'),
  query: z.string().min(2).max(80),
  had_results: z.boolean(),
  source: z.enum(['home', 'shops', 'storefront', 'search', 'direct']),
})
const searchClickEvent = z.object({
  type: z.literal('search_click'),
  subject_type: z.enum(['store', 'product', 'deal', 'spark']),
  subject_id: z.string().uuid(),
  query: z.string().min(2).max(80),
  source: z.literal('search'),
})

const laneViewEvent = z.object({
  type: z.literal('lane_view'),
  lane: z.string().regex(/^[a-z0-9-]{2,40}$/),
  source: z.enum(['home', 'shops', 'storefront', 'search', 'direct', 'lane']),
})
const laneClickEvent = z.object({
  type: z.literal('lane_click'),
  subject_type: z.enum(['store', 'product', 'deal', 'spark']),
  subject_id: z.string().uuid(),
  lane: z.string().regex(/^[a-z0-9-]{2,40}$/),
  source: z.literal('lane'),
})

const schema = z.object({
  events: z.array(z.discriminatedUnion('type', [subjectEvent, searchEvent, searchClickEvent, laneViewEvent, laneClickEvent])).min(1).max(25),
})

/** One existence probe per entity type per batch; returns subject_id → store_id. */
const SUBJECT_SQL: Record<string, string> = {
  store: `SELECT id AS subject_id, id AS store_id FROM stores WHERE id = ANY($1)`,
  product: `SELECT DISTINCT l.product_id AS subject_id, l.channel_id AS store_id
            FROM listings l WHERE l.product_id = ANY($1) AND l.status = 'published'`,
  deal: `SELECT id AS subject_id, channel_id AS store_id FROM deals WHERE id = ANY($1)`,
  spark: `SELECT id AS subject_id, channel_id AS store_id FROM sparks WHERE id = ANY($1)`,
}

export default definePublicEndpoint({
  name: 'attention.record',
  schema,
  rateLimit: { limit: 120, windowSeconds: 60 },
  async handler({ event, body }): Promise<Result<{ accepted: number }, DomainError>> {
    const c = getContainer()
    const visitorId = getVisitorId(event) // read-only: passive attention never mints identity

    // resolve real subjects (and their owning stores) in one probe per type
    const byType = new Map<string, Set<string>>()
    for (const e of body.events) {
      if ('subject_id' in e) {
        const set = byType.get(e.subject_type) ?? new Set()
        set.add(e.subject_id)
        byType.set(e.subject_type, set)
      }
    }
    const known = new Map<string, string>() // `${type}:${id}` → store_id
    for (const [type, ids] of byType) {
      const { rows } = await c.pool.query<{ subject_id: string; store_id: string }>(
        SUBJECT_SQL[type]!, [[...ids]])
      for (const r of rows) known.set(`${type}:${r.subject_id}`, r.store_id)
    }

    const values: unknown[] = []
    const tuples: string[] = []
    let i = 0
    const put = (row: unknown[]) => {
      tuples.push(`(${row.map(() => `$${++i}`).join(', ')})`)
      values.push(...row)
    }
    for (const e of body.events) {
      if (e.type === 'search') {
        put([uuidv7(), 'search', null, null, null, e.source, visitorId, e.query.trim().toLowerCase(), e.had_results])
      } else if (e.type === 'lane_view') {
        if (!laneById(e.lane)) continue // a lane that doesn't exist is not a fact
        put([uuidv7(), 'lane_view', null, null, null, e.source, visitorId, e.lane, null])
      } else if (e.type === 'lane_click') {
        if (!laneById(e.lane)) continue
        const storeId = known.get(`${e.subject_type}:${e.subject_id}`)
        if (!storeId) continue
        put([uuidv7(), 'lane_click', e.subject_type, e.subject_id, storeId, 'lane', visitorId, e.lane, null])
      } else {
        const storeId = known.get(`${e.subject_type}:${e.subject_id}`)
        if (!storeId) continue // fabricated or unpublished subject — dropped, not reported
        const query = e.type === 'search_click' ? e.query.trim().toLowerCase() : null
        put([uuidv7(), e.type, e.subject_type, e.subject_id, storeId, e.source, visitorId, query, null])
      }
    }
    if (tuples.length > 0) {
      await c.pool.query(
        `INSERT INTO attention_facts (id, event_type, subject_type, subject_id, store_id, source, visitor_id, query, had_results)
         VALUES ${tuples.join(', ')}`, values)
    }
    return ok({ accepted: tuples.length })
  },
})
