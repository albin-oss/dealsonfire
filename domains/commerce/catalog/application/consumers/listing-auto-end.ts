/**
 * ListingAutoEnd (VISIBILITY_CONTRACT §8): commerce.product.archived → every listing of
 * that product transitions to `ended`. Idempotent by construction: replays find listings
 * already ended and the detected-change transition emits nothing (V4). System actor;
 * each real transition is evented (`commerce.listing.ended`) and audited (§17).
 */
import type { Tx } from '../../../../../platform/types'
import type { StoredDomainEvent } from '../../domain/events'
import { COMMERCE_EVENT, makeListingEvent, type ProductArchivedPayload } from '../../domain/events'
import { traceFromEvent } from '../../../../../platform/trace'
import type { Actor } from '../../../../merchant/shared-kernel/actor'
import type { CommerceDeps } from '../ports'

export const LISTING_AUTO_END_CONSUMER = 'commerce.listing-auto-end'
const ACTOR: Actor = { type: 'system', id: LISTING_AUTO_END_CONSUMER }

export function listingAutoEndConsumer(deps: CommerceDeps) {
  return {
    consumer: LISTING_AUTO_END_CONSUMER,
    eventTypes: [COMMERCE_EVENT.PRODUCT_ARCHIVED],

    async handle(tx: Tx, event: StoredDomainEvent): Promise<void> {
      const payload = event.payload as unknown as ProductArchivedPayload
      const trace = traceFromEvent(event)
      const now = new Date()
      const listings = await deps.listings.listByProduct(tx, payload.product_id, { forUpdate: true })
      for (const listing of listings) {
        if (!listing.end(now)) continue // already ended — replay-silent
        await deps.listings.update(tx, listing)
        await deps.eventStore.append(tx, [makeListingEvent(COMMERCE_EVENT.LISTING_ENDED, {
          listing_id: listing.id, product_id: listing.productId,
          business_id: listing.businessId, channel_id: listing.channelId,
        }, ACTOR)], trace)
        await deps.audit.record(tx, {
          businessId: listing.businessId, actor: ACTOR, command: 'commerce.listing.end',
          sensitivity: 'normal', target: { type: 'listing', id: listing.id },
          afterDigest: { reason: 'product_archived', product_id: listing.productId },
        })
      }
    },
  }
}
