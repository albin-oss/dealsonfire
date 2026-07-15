/**
 * Commerce catalog events (ADR-002 §13, ADR-003 §7). Platform envelope re-exported per
 * the D-22 pattern. NOTE: the IMP-COM-001 brief lists VariantUpdated as the only variant
 * change event; ADR-002 §13 additionally defines `commerce.variant.price_changed` as a
 * high-fan-out event (Orders cart revalidation, price history, fraud signals). The frozen
 * ADR wins: price changes emit BOTH variant.updated (when other fields changed) and
 * variant.price_changed (always, with old/new) — recorded in D-28.
 *
 * Ordering scope (D-19): every commerce catalog event is business-scoped → business_id.
 */
import type { Actor } from '../../../merchant/shared-kernel/actor'
import type { NewDomainEvent } from '../../../../platform/events'
import type { FulfillmentKind, ProductStatus } from './value-objects'

export type { NewDomainEvent, StoredDomainEvent, TraceContext } from '../../../../platform/events'

export const COMMERCE_EVENT = {
  PRODUCT_CREATED: 'commerce.product.created',
  PRODUCT_UPDATED: 'commerce.product.updated',
  PRODUCT_ARCHIVED: 'commerce.product.archived',
  VARIANT_ADDED: 'commerce.variant.added',
  VARIANT_UPDATED: 'commerce.variant.updated',
  VARIANT_PRICE_CHANGED: 'commerce.variant.price_changed',
  PRODUCT_MEDIA_ADDED: 'commerce.product.media_added',
  PRODUCT_MEDIA_REMOVED: 'commerce.product.media_removed',
  // VISIBILITY_CONTRACT §7 — the only publication vocabulary any consumer may use
  LISTING_PUBLISHED: 'commerce.listing.published',
  LISTING_UNPUBLISHED: 'commerce.listing.unpublished',
  LISTING_ENDED: 'commerce.listing.ended',
} as const

export interface ProductCreatedPayload {
  product_id: string
  business_id: string
  title: string
  fulfillment_kind: FulfillmentKind
  category_path: string | null
  status: ProductStatus
  variant_count: number
  source: 'manual' | 'draft'
}
export interface ProductUpdatedPayload {
  product_id: string
  business_id: string
  fields_changed: string[]
  status: ProductStatus
}
export interface ProductArchivedPayload { product_id: string; business_id: string }
export interface VariantAddedPayload {
  product_id: string
  business_id: string
  variant_id: string
  sku: string
  option_values: Record<string, string>
}
export interface VariantUpdatedPayload {
  product_id: string
  business_id: string
  variant_id: string
  fields_changed: string[]
}
export interface VariantPriceChangedPayload {
  product_id: string
  business_id: string
  variant_id: string
  old_price: { amount: number; currency: string }
  new_price: { amount: number; currency: string }
  sale_active: boolean
  source: 'manual' | 'schedule'
}
export interface ProductMediaAddedPayload {
  product_id: string
  business_id: string
  product_media_id: string
  media_id: string
  variant_id: string | null
  role: string
}
export interface ProductMediaRemovedPayload {
  product_id: string
  business_id: string
  product_media_id: string
  media_id: string
}

/** VISIBILITY_CONTRACT §7: all three listing events share one payload shape. */
export type ListingEventPayload = {
  listing_id: string
  product_id: string
  business_id: string
  channel_id: string
}

/** Listing events sequence on the LISTING aggregate (its own machine — ADR-002 §0.3). */
export function makeListingEvent(
  eventType: string,
  payload: ListingEventPayload,
  actor: Actor,
): NewDomainEvent<ListingEventPayload> {
  return Object.freeze({
    eventType,
    schemaVersion: 1,
    businessId: payload.business_id,
    aggregate: { type: 'listing', id: payload.listing_id },
    actor,
    payload: Object.freeze(payload),
  })
}

export function makeCommerceEvent<P>(
  eventType: string,
  productId: string,
  businessId: string,
  actor: Actor,
  payload: P,
  schemaVersion = 1,
): NewDomainEvent<P> {
  return Object.freeze({
    eventType,
    schemaVersion,
    businessId,
    aggregate: { type: 'product', id: productId },
    actor,
    payload: Object.freeze(payload), // L-4: payloads are facts; facts don't mutate in flight
  })
}

/** Commerce ordering scope (D-19): all catalog facts are business-scoped. */
export function commerceOrderingScopeOf(event: NewDomainEvent): string {
  return event.businessId ?? event.aggregate.id
}
