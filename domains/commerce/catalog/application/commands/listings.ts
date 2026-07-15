/**
 * Listing commands (VISIBILITY_CONTRACT §6; PR-1). publishToStore / unpublishFromStore —
 * the merchant's intent acts, in merchant language ("On your store"), never the noun.
 * Triple-gated (catalog.listing.write), one transaction, detected-change events (V4),
 * audited (§17). The publish bar reuses the domain's own truth (a priced variant exists —
 * the SellableSpecification's authoring-side clause), never a duplicate readiness model.
 */
import { type Result, ok, err } from '../../../../../shared/result'
import { domainError, type DomainError } from '../../../../../shared/errors'
import { traceFromRequest } from '../../../../../platform/trace'
import { uuidv7 } from '../../../../../platform/uuid'
import type { Tx } from '../../../../../platform/types'
import type { Actor } from '../../../../merchant/shared-kernel/actor'
import type { Product } from '../../domain/product'
import { Listing } from '../../domain/listing'
import { COMMERCE_EVENT, makeListingEvent } from '../../domain/events'
import { withAuthorizedProduct } from '../access'
import type { CommerceDeps } from '../ports'

const SPEC = { permission: 'catalog.listing.write', capability: 'catalog.products' } as const

export interface ListingCommand {
  actor: Actor
  userId: string
  productId: string
  storeId: string
  requestContext?: Record<string, unknown>
}

export interface ListingResult {
  listingId: string
  status: 'published' | 'unpublished' | 'ended'
  changed: boolean
}

/**
 * Shared upsert used by publishToStore AND create-product's publish_to_store_id path:
 * auto-create published, or transition an existing row (republish after unpublish/restore).
 * Emits + audits only on detected change. Caller has already authorized and validated.
 */
export async function upsertPublishedListing(
  deps: CommerceDeps,
  tx: Tx,
  input: { product: Product; channelId: string; actor: Actor; requestContext?: Record<string, unknown> },
): Promise<ListingResult> {
  const now = new Date()
  const existing = await deps.listings.findByProductAndChannel(tx, input.product.id, input.channelId, { forUpdate: true })
  let listing = existing
  let changed: boolean
  if (!listing) {
    listing = Listing.publish({ id: uuidv7(), businessId: input.product.businessId, productId: input.product.id, channelId: input.channelId }, now)
    await deps.listings.insert(tx, listing)
    changed = true
  } else {
    changed = listing.publishAgain(now)
    if (changed) await deps.listings.update(tx, listing)
  }
  if (changed) {
    await deps.eventStore.append(tx, [makeListingEvent(COMMERCE_EVENT.LISTING_PUBLISHED, {
      listing_id: listing.id, product_id: input.product.id, business_id: input.product.businessId, channel_id: input.channelId,
    }, input.actor)], traceFromRequest(input.requestContext))
    await deps.audit.record(tx, {
      businessId: input.product.businessId, actor: input.actor, command: 'commerce.listing.publish',
      sensitivity: 'normal', target: { type: 'listing', id: listing.id },
      afterDigest: { product_id: input.product.id, channel_id: input.channelId, status: 'published' },
      context: input.requestContext,
    })
  }
  return { listingId: listing.id, status: listing.status, changed }
}

export function publishToStoreCommand(deps: CommerceDeps) {
  return async (input: ListingCommand): Promise<Result<ListingResult, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const authorized = await withAuthorizedProduct(deps, tx, {
        userId: input.userId, actor: input.actor, productId: input.productId,
        spec: { command: 'commerce.listing.publish', ...SPEC },
      })
      if (!authorized.ok) return authorized
      const { product } = authorized.value

      if (product.status === 'archived') {
        return err(domainError('CONFLICT', 'restore this product before putting it back on your store'))
      }
      // the publish bar = the domain's own truth: something a buyer could actually buy
      if (!product.variants.some((v) => v.price.amount > 0)) {
        return err(domainError('VALIDATION_FAILED', 'give it a price first — then it can go on your store'))
      }
      const channel = await deps.merchantAccess.resolveStoreChannel(tx, product.businessId, input.storeId)
      if (!channel.ok) return channel

      return ok(await upsertPublishedListing(deps, tx, {
        product, channelId: channel.value.channelId, actor: input.actor, requestContext: input.requestContext,
      }))
    })
  }
}

export function unpublishFromStoreCommand(deps: CommerceDeps) {
  return async (input: ListingCommand): Promise<Result<ListingResult, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const authorized = await withAuthorizedProduct(deps, tx, {
        userId: input.userId, actor: input.actor, productId: input.productId,
        spec: { command: 'commerce.listing.unpublish', ...SPEC },
      })
      if (!authorized.ok) return authorized
      const { product } = authorized.value

      const channel = await deps.merchantAccess.resolveStoreChannel(tx, product.businessId, input.storeId)
      if (!channel.ok) return channel

      const listing = await deps.listings.findByProductAndChannel(tx, product.id, channel.value.channelId, { forUpdate: true })
      if (!listing) {
        // never on the store = already the desired outcome (idempotent intent, V4)
        return ok({ listingId: '', status: 'unpublished', changed: false })
      }
      const changed = listing.unpublish(new Date())
      if (changed) {
        await deps.listings.update(tx, listing)
        await deps.eventStore.append(tx, [makeListingEvent(COMMERCE_EVENT.LISTING_UNPUBLISHED, {
          listing_id: listing.id, product_id: product.id, business_id: product.businessId, channel_id: channel.value.channelId,
        }, input.actor)], traceFromRequest(input.requestContext))
        await deps.audit.record(tx, {
          businessId: product.businessId, actor: input.actor, command: 'commerce.listing.unpublish',
          sensitivity: 'normal', target: { type: 'listing', id: listing.id },
          afterDigest: { product_id: product.id, channel_id: channel.value.channelId, status: 'unpublished' },
          context: input.requestContext,
        })
      }
      return ok({ listingId: listing.id, status: listing.status, changed })
    })
  }
}
