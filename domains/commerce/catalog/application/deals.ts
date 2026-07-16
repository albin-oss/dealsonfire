/**
 * Deals — the SOCIAL half (Release 0.3). A Deal is a shareable promotion story over one
 * published product on one channel: headline + story + the product, nothing price-affecting
 * (the value strategy joins with CS4 Offers via deals.offer_id — the seam, named in 0013).
 * Creating a deal REQUIRES the product be on the store (a deal must never point at a hidden
 * product); public visibility = deal published ∧ the product's visibility conjunction.
 * Commands are triple-gated, evented, audited, one transaction (kernel shape).
 */
import { type Result, ok, err } from '../../../../shared/result'
import { domainError, type DomainError } from '../../../../shared/errors'
import { traceFromRequest } from '../../../../platform/trace'
import { uuidv7 } from '../../../../platform/uuid'
import type { Tx } from '../../../../platform/types'
import { asClient } from '../../../../platform/db'
import type { Actor } from '../../../merchant/shared-kernel/actor'
import { COMMERCE_EVENT, makeDealEvent } from '../domain/events'
import { withAuthorizedProduct } from './access'
import type { CommerceDeps } from './ports'

const SPEC = { permission: 'catalog.listing.write', capability: 'catalog.products' } as const

export interface DealRow {
  id: string
  product_id: string
  headline: string
  story: string | null
  status: 'published' | 'ended'
  published_at: string
  fires: number
  saves: number
}

export class PgDealRepository {
  async insert(tx: Tx, deal: { id: string; businessId: string; productId: string; channelId: string; headline: string; story: string | null }): Promise<void> {
    await asClient(tx).query(
      `INSERT INTO deals (id, business_id, product_id, channel_id, headline, story) VALUES ($1, $2, $3, $4, $5, $6)`,
      [deal.id, deal.businessId, deal.productId, deal.channelId, deal.headline, deal.story])
  }

  async end(tx: Tx, dealId: string, businessId: string): Promise<{ productId: string; channelId: string; headline: string } | null> {
    const { rows } = await asClient(tx).query<{ product_id: string; channel_id: string; headline: string }>(
      `UPDATE deals SET status = 'ended', ended_at = now(), updated_at = now()
       WHERE id = $1 AND business_id = $2 AND status = 'published'
       RETURNING product_id, channel_id, headline`,
      [dealId, businessId])
    return rows[0] ? { productId: rows[0].product_id, channelId: rows[0].channel_id, headline: rows[0].headline } : null
  }

  async listByBusiness(tx: Tx, businessId: string): Promise<DealRow[]> {
    const { rows } = await asClient(tx).query<DealRow>(
      `SELECT d.id, d.product_id, d.headline, d.story, d.status, d.published_at::text AS published_at,
              (SELECT count(*)::int FROM deal_reactions r WHERE r.deal_id = d.id) AS fires,
              (SELECT count(*)::int FROM deal_saves sv WHERE sv.deal_id = d.id) AS saves
       FROM deals d WHERE d.business_id = $1 ORDER BY d.published_at DESC LIMIT 50`, [businessId])
    return rows
  }

  /**
   * Public deal read: the deal AND its product must both be visible (VISIBILITY_CONTRACT
   * §1 — a deal can never leak a hidden product). Null = the endpoint masks to 404.
   */
  async findPublic(tx: Tx, businessId: string, channelId: string, dealId: string): Promise<{
    id: string; headline: string; story: string | null; published_at: string
    product: { id: string; title: string; description: { content?: string } | null; min_price_amount: number | null; price_currency: string | null; image_url: string | null; image_alt: string | null }
  } | null> {
    const { rows } = await asClient(tx).query<{
      id: string; headline: string; story: string | null; published_at: string
      product_id: string; title: string; description: { content?: string } | null
      min_price_amount: number | null; price_currency: string | null
      image_url: string | null; image_alt: string | null
    }>(
      `SELECT d.id, d.headline, d.story, d.published_at::text AS published_at,
              p.id AS product_id, p.title, p.description,
              (SELECT min(v.price_amount)::int FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS min_price_amount,
              (SELECT min(v.price_currency) FROM product_variants v WHERE v.price_amount > 0 AND v.product_id = p.id) AS price_currency,
              img.url AS image_url, img.alt_text AS image_alt
       FROM deals d
       JOIN listings l ON l.product_id = d.product_id AND l.channel_id = d.channel_id AND l.status = 'published'
       JOIN products p ON p.id = d.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
       LEFT JOIN LATERAL (
         SELECT ma.url, pm.alt_text FROM product_media pm
         JOIN media_assets ma ON ma.id = pm.media_id
         WHERE pm.product_id = p.id
         ORDER BY (pm.role = 'hero') DESC, pm.position ASC
         LIMIT 1
       ) img ON true
       WHERE d.id = $3 AND d.business_id = $1 AND d.channel_id = $2 AND d.status = 'published'`,
      [businessId, channelId, dealId])
    const r = rows[0]
    if (!r) return null
    return {
      id: r.id, headline: r.headline, story: r.story, published_at: r.published_at,
      product: {
        id: r.product_id, title: r.title, description: r.description,
        min_price_amount: r.min_price_amount, price_currency: r.price_currency,
        image_url: r.image_url, image_alt: r.image_alt,
      },
    }
  }
}

export interface CreateDealInput {
  actor: Actor
  userId: string
  productId: string
  storeId: string
  headline: string
  story?: string | null
  requestContext?: Record<string, unknown>
}

export function createDealCommand(deps: CommerceDeps, deals: PgDealRepository) {
  return async (input: CreateDealInput): Promise<Result<{ dealId: string }, DomainError>> => {
    const headline = input.headline.trim()
    if (headline.length < 1 || headline.length > 90) {
      return err(domainError('VALIDATION_FAILED', 'give the deal a headline — up to 90 characters'))
    }
    const story = input.story?.trim() || null
    if (story && story.length > 600) {
      return err(domainError('VALIDATION_FAILED', 'the story fits in 600 characters — short and worth reading'))
    }
    return deps.uow.withTransaction(async (tx) => {
      const authorized = await withAuthorizedProduct(deps, tx, {
        userId: input.userId, actor: input.actor, productId: input.productId,
        spec: { command: 'commerce.deal.create', ...SPEC },
      })
      if (!authorized.ok) return authorized
      const { product } = authorized.value

      const channel = await deps.merchantAccess.resolveStoreChannel(tx, product.businessId, input.storeId)
      if (!channel.ok) return channel

      // a deal points only at something the world can see
      const listing = await deps.listings.findByProductAndChannel(tx, product.id, channel.value.channelId)
      if (!listing || listing.status !== 'published') {
        return err(domainError('CONFLICT', 'put this product on your store first — a deal needs something to point at'))
      }

      const dealId = uuidv7()
      await deals.insert(tx, {
        id: dealId, businessId: product.businessId, productId: product.id,
        channelId: channel.value.channelId, headline, story,
      })
      await deps.eventStore.append(tx, [makeDealEvent(COMMERCE_EVENT.DEAL_PUBLISHED, {
        deal_id: dealId, product_id: product.id, business_id: product.businessId,
        channel_id: channel.value.channelId, headline,
      }, input.actor)], traceFromRequest(input.requestContext))
      await deps.audit.record(tx, {
        businessId: product.businessId, actor: input.actor, command: 'commerce.deal.create',
        sensitivity: 'normal', target: { type: 'deal', id: dealId },
        afterDigest: { product_id: product.id, headline }, context: input.requestContext,
      })
      return ok({ dealId })
    })
  }
}

export function endDealCommand(deps: CommerceDeps, deals: PgDealRepository) {
  return async (input: { actor: Actor; userId: string; businessId: string; dealId: string; requestContext?: Record<string, unknown> }): Promise<Result<{ ended: boolean }, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const access = await deps.merchantAccess.resolveAccess(tx, input.userId, input.businessId)
      if (!access.ok) return access
      const ended = await deals.end(tx, input.dealId, input.businessId)
      if (!ended) return ok({ ended: false }) // already ended or unknown — idempotent intent
      await deps.eventStore.append(tx, [makeDealEvent(COMMERCE_EVENT.DEAL_ENDED, {
        deal_id: input.dealId, product_id: ended.productId, business_id: input.businessId,
        channel_id: ended.channelId, headline: ended.headline,
      }, input.actor)], traceFromRequest(input.requestContext))
      await deps.audit.record(tx, {
        businessId: input.businessId, actor: input.actor, command: 'commerce.deal.end',
        sensitivity: 'normal', target: { type: 'deal', id: input.dealId },
        afterDigest: { headline: ended.headline }, context: input.requestContext,
      })
      return ok({ ended: true })
    })
  }
}

export function listDealsQuery(deps: CommerceDeps, deals: PgDealRepository) {
  return async (input: { userId: string; businessId: string }): Promise<Result<DealRow[], DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const access = await deps.merchantAccess.resolveAccess(tx, input.userId, input.businessId)
      if (!access.ok) return access
      return ok(await deals.listByBusiness(tx, input.businessId))
    })
  }
}
