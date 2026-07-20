/**
 * Sparks (Release 0.6) — the content layer: a short public update in the store's voice.
 * Body + optional photo (Media Port ref, owned by the business) + optional product
 * pointer (must be ON the store at publish time — a spark never points at something the
 * world can't see; if the product later hides, the public read drops the CARD and keeps
 * the spark). Publish/delete are gated, evented, audited; reactions reuse the
 * subject-agnostic engagement toggle. Visible iff spark published ∧ store live.
 */
import { type Result, ok, err } from '../../../../shared/result'
import { domainError, type DomainError } from '../../../../shared/errors'
import { traceFromRequest } from '../../../../platform/trace'
import { uuidv7 } from '../../../../platform/uuid'
import type { Tx } from '../../../../platform/types'
import { asClient } from '../../../../platform/db'
import type { Actor } from '../../../merchant/shared-kernel/actor'
import { COMMERCE_EVENT, makeSparkEvent, makeSparkEngagementEvent } from '../domain/events'
import type { EngagementSubject } from './engagement'
import { withAuthorizedBusiness } from './access'
import type { CommerceDeps } from './ports'

const SPEC = { permission: 'catalog.listing.write', capability: 'catalog.products' } as const

export interface SparkRow {
  id: string
  body: string
  status: 'published' | 'deleted'
  published_at: string
  product_id: string | null
  image_url: string | null
  fires: number
}

/** Spark reactions ride the Release-0.4 toggle discipline. */
export const SPARK_REACTION_SUBJECT: EngagementSubject = {
  table: 'spark_reactions', subjectColumn: 'spark_id', targetType: 'spark',
  command: 'commerce.spark.react',
  makeEvent: ({ subjectId, businessId, visitorId }, actor, active) =>
    makeSparkEngagementEvent(
      active ? COMMERCE_EVENT.SPARK_REACTED : COMMERCE_EVENT.SPARK_UNREACTED,
      { spark_id: subjectId, business_id: businessId, visitor_id: visitorId },
      actor,
    ) as never,
}

export class PgSparkRepository {
  /** Commerce terms of the spark conjunction; store liveness is the caller's half. */
  async resolveEngageable(tx: Tx, sparkId: string): Promise<{ businessId: string; channelId: string } | null> {
    const { rows } = await asClient(tx).query<{ business_id: string; channel_id: string }>(
      `SELECT business_id, channel_id FROM sparks WHERE id = $1 AND status = 'published'`, [sparkId])
    return rows[0] ? { businessId: rows[0].business_id, channelId: rows[0].channel_id } : null
  }

  async listByBusiness(tx: Tx, businessId: string): Promise<SparkRow[]> {
    const { rows } = await asClient(tx).query<SparkRow>(
      `SELECT sp.id, sp.body, sp.status, sp.published_at::text AS published_at, sp.product_id,
              ma.url AS image_url,
              (SELECT count(*)::int FROM spark_reactions r WHERE r.spark_id = sp.id) AS fires
       FROM sparks sp
       LEFT JOIN media_assets ma ON ma.id = sp.media_id
       WHERE sp.business_id = $1 AND sp.status = 'published'
       ORDER BY sp.published_at DESC LIMIT 50`, [businessId])
    return rows
  }

  /** Newest sparks for a live storefront (the caller resolved liveness). */
  async listPublicByChannel(tx: Tx, businessId: string, channelId: string, limit = 3): Promise<Array<{
    id: string; body: string; published_at: string; image_url: string | null
  }>> {
    const { rows } = await asClient(tx).query<{ id: string; body: string; published_at: string; image_url: string | null }>(
      `SELECT sp.id, sp.body, sp.published_at::text AS published_at, ma.url AS image_url
       FROM sparks sp
       LEFT JOIN media_assets ma ON ma.id = sp.media_id
       WHERE sp.business_id = $1 AND sp.channel_id = $2 AND sp.status = 'published'
       ORDER BY sp.published_at DESC LIMIT $3`, [businessId, channelId, Math.min(limit, 12)])
    return rows
  }

  /**
   * Public spark page read: the spark survives its product hiding — the product CARD
   * rides only while the full product conjunction holds (LEFT JOIN, VISIBILITY §1).
   */
  async findPublic(tx: Tx, businessId: string, channelId: string, sparkId: string): Promise<{
    id: string; body: string; published_at: string; image_url: string | null
    product: { id: string; title: string; min_price_amount: number | null; price_currency: string | null; image_url: string | null; image_alt: string | null } | null
  } | null> {
    const { rows } = await asClient(tx).query<{
      id: string; body: string; published_at: string; image_url: string | null
      p_id: string | null; p_title: string | null; p_price: number | null; p_currency: string | null
      p_image: string | null; p_alt: string | null
    }>(
      `SELECT sp.id, sp.body, sp.published_at::text AS published_at, ma.url AS image_url,
              vp.id AS p_id, vp.title AS p_title, vp.min_price_amount AS p_price,
              vp.price_currency AS p_currency, vp.image_url AS p_image, vp.image_alt AS p_alt
       FROM sparks sp
       LEFT JOIN media_assets ma ON ma.id = sp.media_id
       LEFT JOIN LATERAL (
         SELECT p.id, p.title,
                (SELECT min(v.price_amount)::int FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS min_price_amount,
                (SELECT min(v.price_currency) FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS price_currency,
                pimg.url AS image_url, pimg.alt_text AS image_alt
         FROM products p
         JOIN listings l ON l.product_id = p.id AND l.channel_id = sp.channel_id AND l.status = 'published'
         LEFT JOIN LATERAL (
           SELECT ma2.url, pm.alt_text FROM product_media pm
           JOIN media_assets ma2 ON ma2.id = pm.media_id
           WHERE pm.product_id = p.id
           ORDER BY (pm.role = 'hero') DESC, pm.position ASC LIMIT 1
         ) pimg ON true
         WHERE p.id = sp.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
       ) vp ON true
       WHERE sp.id = $3 AND sp.business_id = $1 AND sp.channel_id = $2 AND sp.status = 'published'`,
      [businessId, channelId, sparkId])
    const r = rows[0]
    if (!r) return null
    return {
      id: r.id, body: r.body, published_at: r.published_at, image_url: r.image_url,
      product: r.p_id ? {
        id: r.p_id, title: r.p_title!, min_price_amount: r.p_price, price_currency: r.p_currency,
        image_url: r.p_image, image_alt: r.p_alt,
      } : null,
    }
  }
}

export interface PublishSparkInput {
  actor: Actor
  userId: string
  businessId: string
  storeId: string
  body: string
  mediaId?: string | null
  productId?: string | null
  requestContext?: Record<string, unknown>
}

export function publishSparkCommand(deps: CommerceDeps) {
  return async (input: PublishSparkInput): Promise<Result<{ sparkId: string }, DomainError>> => {
    const body = input.body.trim()
    if (body.length < 1 || body.length > 500) {
      return err(domainError('VALIDATION_FAILED', 'a spark is 1–500 characters — short and worth reading'))
    }
    return deps.uow.withTransaction(async (tx) => {
      const access = await withAuthorizedBusiness(deps, tx, {
        userId: input.userId, actor: input.actor, businessId: input.businessId,
        spec: { command: 'commerce.spark.publish', ...SPEC },
      })
      if (!access.ok) return access

      const channel = await deps.merchantAccess.resolveStoreChannel(tx, input.businessId, input.storeId)
      if (!channel.ok) return channel
      const client = asClient(tx)

      // the photo must be the business's own registered asset
      if (input.mediaId) {
        const { rows } = await client.query(
          `SELECT 1 FROM media_assets WHERE id = $1 AND business_id = $2`, [input.mediaId, input.businessId])
        if (rows.length === 0) return err(domainError('VALIDATION_FAILED', 'that photo isn’t in your library'))
      }
      // a referenced product must be ON the store (same educating rule as deals)
      if (input.productId) {
        const listing = await deps.listings.findByProductAndChannel(tx, input.productId, channel.value.channelId)
        if (!listing || listing.status !== 'published') {
          return err(domainError('CONFLICT', 'put this product on your store first — a spark can only point at something the world can see'))
        }
      }

      const sparkId = uuidv7()
      await client.query(
        `INSERT INTO sparks (id, business_id, channel_id, body, media_id, product_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sparkId, input.businessId, channel.value.channelId, body, input.mediaId ?? null, input.productId ?? null])
      await deps.eventStore.append(tx, [makeSparkEvent(COMMERCE_EVENT.SPARK_PUBLISHED, {
        spark_id: sparkId, business_id: input.businessId, channel_id: channel.value.channelId,
      }, input.actor)], traceFromRequest(input.requestContext))
      await deps.audit.record(tx, {
        businessId: input.businessId, actor: input.actor, command: 'commerce.spark.publish',
        sensitivity: 'normal', target: { type: 'spark', id: sparkId },
        afterDigest: { body_length: body.length, has_media: !!input.mediaId, product_id: input.productId ?? null },
        context: input.requestContext,
      })
      return ok({ sparkId })
    })
  }
}

export function deleteSparkCommand(deps: CommerceDeps) {
  return async (input: { actor: Actor; userId: string; businessId: string; sparkId: string; requestContext?: Record<string, unknown> }): Promise<Result<{ deleted: boolean }, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const access = await deps.merchantAccess.resolveAccess(tx, input.userId, input.businessId)
      if (!access.ok) return access
      const { rows } = await asClient(tx).query<{ channel_id: string }>(
        `UPDATE sparks SET status = 'deleted', deleted_at = now(), updated_at = now()
         WHERE id = $1 AND business_id = $2 AND status = 'published'
         RETURNING channel_id`,
        [input.sparkId, input.businessId])
      if (rows.length === 0) return ok({ deleted: false }) // already gone — idempotent intent
      await deps.eventStore.append(tx, [makeSparkEvent(COMMERCE_EVENT.SPARK_DELETED, {
        spark_id: input.sparkId, business_id: input.businessId, channel_id: rows[0]!.channel_id,
      }, input.actor)], traceFromRequest(input.requestContext))
      await deps.audit.record(tx, {
        businessId: input.businessId, actor: input.actor, command: 'commerce.spark.delete',
        sensitivity: 'normal', target: { type: 'spark', id: input.sparkId }, context: input.requestContext,
      })
      return ok({ deleted: true })
    })
  }
}

export function listSparksQuery(deps: CommerceDeps, sparks: PgSparkRepository) {
  return async (input: { userId: string; businessId: string }): Promise<Result<SparkRow[], DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const access = await deps.merchantAccess.resolveAccess(tx, input.userId, input.businessId)
      if (!access.ok) return access
      return ok(await sparks.listByBusiness(tx, input.businessId))
    })
  }
}
