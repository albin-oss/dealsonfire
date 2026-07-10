/**
 * Ports (BLUEPRINT-001 §3): repository/service interfaces defined in the domain,
 * implemented in infrastructure. `Tx` is an opaque transaction handle — the domain
 * never sees the driver. Repositories load/save whole aggregates; none exposes another
 * aggregate's rows (ADR-001 §5.4).
 * Platform-generic ports (Tx, UnitOfWork, EventStore, AuditLog) moved to platform/ in
 * Batch 1 (K1) and are re-exported here so merchant import paths stay stable.
 */
import type { MerchantAccount } from './merchant-account'
import type { Business } from './business'
import type { Store } from './store'
import type { StaffMembership } from './staff-membership'
import type { Tx } from '../../../../platform/types'
import type { BrandKit } from '../../shared-kernel/brand-kit'
import type { BusinessId, StoreId, UserId } from '../../shared-kernel/ids'
import type { TrustLevel, ScaleTier } from '../../shared-kernel/trust'

export type { Tx, UnitOfWork, EventStore, AuditEntry, AuditLog } from '../../../../platform/types'

export interface MerchantAccountRepository {
  findByUserId(tx: Tx, userId: UserId): Promise<MerchantAccount | null>
  /** Race-safe first-merchant creation (REVIEW-001 M-4): false = another request won; re-fetch. */
  insertIfAbsent(tx: Tx, account: MerchantAccount): Promise<boolean>
}

export interface BusinessRepository {
  /** forUpdate locks the row for the duration of the command transaction. */
  findById(tx: Tx, id: BusinessId, opts?: { forUpdate?: boolean }): Promise<Business | null>
  insert(tx: Tx, business: Business): Promise<void>
  update(tx: Tx, business: Business): Promise<void>
}

export interface StoreRepository {
  findById(tx: Tx, id: StoreId, opts?: { forUpdate?: boolean }): Promise<Store | null>
  countActiveByBusiness(tx: Tx, businessId: BusinessId): Promise<number>
  listByBusiness(tx: Tx, businessId: BusinessId): Promise<Store[]>
  insert(tx: Tx, store: Store): Promise<void>
  update(tx: Tx, store: Store): Promise<void>
}

export interface StaffMembershipRepository {
  findActiveForUser(tx: Tx, businessId: BusinessId, userId: string): Promise<StaffMembership | null>
  listActiveByPrincipal(tx: Tx, principalId: string): Promise<StaffMembership[]>
  insert(tx: Tx, membership: StaffMembership): Promise<void>
  update(tx: Tx, membership: StaffMembership): Promise<void>
}

export interface StoredBrandKit {
  brandKit: BrandKit
  ownerType: 'store' | 'business'
  ownerId: string
  businessId: BusinessId
}

export interface BrandKitRepository {
  findByOwner(tx: Tx, ownerType: 'store' | 'business', ownerId: string): Promise<StoredBrandKit | null>
  /** Whole-value replace (VO semantics — PUT, never PATCH). */
  upsert(tx: Tx, stored: StoredBrandKit): Promise<void>
}

export interface StorefrontConfigRepository {
  insertDefault(tx: Tx, input: { storeId: StoreId; businessId: BusinessId; themeKey: string }): Promise<void>
  existsForStore(tx: Tx, storeId: StoreId): Promise<boolean>
}

export interface HandleLedger {
  /** Claim a handle for a store, atomically. False = taken/reserved/quarantined (409 upstream). */
  claim(tx: Tx, handle: string, storeId: StoreId): Promise<boolean>
}

export interface CapabilityDefinition {
  key: string
  requiredTrustLevel: TrustLevel
  requiredScaleTier: ScaleTier
  dependencies: string[]
  defaultAvailable: boolean
}

export interface CapabilityRepository {
  allDefinitions(tx: Tx): Promise<CapabilityDefinition[]>
  liveEntitlementKeys(tx: Tx, businessId: BusinessId): Promise<string[]>
}

/** Module 1 adapter reports catalogAvailable=false (DECISIONS D-03); Module 2 replaces it. */
export interface ListingReadinessPort {
  forStore(tx: Tx, storeId: StoreId): Promise<{ catalogAvailable: boolean; publishedListingCount: number }>
}
