/**
 * Kernel dependency bundle — assembled once by the composition root (server/utils/container.ts),
 * injected into every command/query. Keeps the application layer framework-free and testable.
 */
import type {
  UnitOfWork, MerchantAccountRepository, BusinessRepository, StoreRepository,
  StaffMembershipRepository, BrandKitRepository, StorefrontConfigRepository,
  HandleLedger, CapabilityRepository, EventStore, AuditLog, ListingReadinessPort,
} from '../domain/ports'

export interface KernelDeps {
  uow: UnitOfWork
  merchantAccounts: MerchantAccountRepository
  businesses: BusinessRepository
  stores: StoreRepository
  staff: StaffMembershipRepository
  brandKits: BrandKitRepository
  storefrontConfigs: StorefrontConfigRepository
  handles: HandleLedger
  capabilities: CapabilityRepository
  eventStore: EventStore
  audit: AuditLog
  listingReadiness: ListingReadinessPort
}
