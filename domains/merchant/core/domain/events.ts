/**
 * Merchant domain events (ADR-001 §5.5). The envelope types are the PLATFORM's
 * (ADR-003 §4, extracted in Batch 1/K1) — re-exported here so merchant code keeps one
 * import path; this module owns what is genuinely merchant's: the event catalog, typed
 * payloads, the narrow aggregate-type union, and the D-19 ordering-scope definition.
 */
import type { Actor } from '../../shared-kernel/actor'
import type { NewDomainEvent } from '../../../../platform/events'
import type { Standing, TrustLevel, ScaleTier } from '../../shared-kernel/trust'

export type { NewDomainEvent, StoredDomainEvent, TraceContext } from '../../../../platform/events'

export type AggregateType = 'merchant_account' | 'business' | 'store' | 'staff_membership'

export interface AggregateRef {
  readonly type: AggregateType
  readonly id: string
}

/**
 * Merchant's ordering scope (D-19): business_id for business-scoped events, the aggregate
 * id otherwise (e.g. merchant.onboarded is ordered per merchant account, not per business).
 * Passed to the platform event store at composition time.
 */
export function orderingScopeOf(event: NewDomainEvent): string {
  return event.businessId ?? event.aggregate.id
}

// ——— Event types (published language; consumers tolerate unknown payload fields)
export const EVENT = {
  MERCHANT_ONBOARDED: 'merchant.onboarded',
  BUSINESS_CREATED: 'merchant.business.created',
  BUSINESS_STANDING_CHANGED: 'merchant.business.standing_changed',
  BUSINESS_TRUST_LEVEL_RAISED: 'merchant.business.trust_level_raised',
  STORE_CREATED: 'merchant.store.created',
  STORE_PUBLISHED: 'merchant.store.published',
  STORE_RESUMED: 'merchant.store.resumed',
  STORE_BRAND_KIT_UPDATED: 'merchant.store.brand_kit_updated',
  STORE_ENFORCEMENT_HOLD_CHANGED: 'merchant.store.enforcement_hold_changed',
  STAFF_JOINED: 'merchant.staff.joined',
  // Release 0.4 engagement — visitors follow stores ('guest' actors)
  STORE_FOLLOWED: 'merchant.store.followed',
  STORE_UNFOLLOWED: 'merchant.store.unfollowed',
} as const

export type StoreFollowPayload = {
  store_id: string
  business_id: string
  visitor_id: string
}

export interface MerchantOnboardedPayload { merchant_id: string; user_id: string; source: 'ignite' | 'direct' }
export interface BusinessCreatedPayload { business_id: string; business_type: string; scale_tier: ScaleTier; trust_level: TrustLevel }
export interface BusinessStandingChangedPayload { business_id: string; from: Standing; to: Standing; reason_code: string }
export interface StoreCreatedPayload { store_id: string; business_id: string; handle: string; name: string }
export interface StorePublishedPayload { store_id: string; business_id: string; handle: string; name: string; brand_kit: { name: string; palette: Record<string, string> } | null }
export interface StoreResumedPayload { store_id: string; business_id: string; handle: string; name: string }
export interface StoreBrandKitUpdatedPayload { store_id: string; business_id: string; name: string }
export interface StoreEnforcementHoldChangedPayload { store_id: string; business_id: string; from: string; to: string; reason_code: string }
export interface StaffJoinedPayload { membership_id: string; business_id: string; principal_type: string; principal_id: string; roles: string[] }

export function makeEvent<P>(
  eventType: string,
  aggregate: AggregateRef,
  businessId: string | null,
  actor: Actor,
  payload: P,
  schemaVersion = 1,
): NewDomainEvent<P> {
  return Object.freeze({ eventType, schemaVersion, businessId, aggregate, actor, payload: Object.freeze(payload) })
}
