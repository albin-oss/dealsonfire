/**
 * Operations application ports (OPS-001-BLUEPRINT OB-1: interfaces live in shared-kernel
 * so all operations modules share one OperationsDeps; implementations stay per-module in
 * infrastructure/ and the composition root).
 *
 * MerchantAccessPort is declared here with the same structural shape commerce declares —
 * the composition root's single `merchantAccessAdapter` instance satisfies both (CDC-001:
 * the triple gate runs in the merchant's context for every operations command).
 */
import type { Result } from '../../../shared/result'
import type { DomainError } from '../../../shared/errors'
import type { Tx, UnitOfWork, EventStore, AuditLog } from '../../../platform/types'
import type { MembershipView, BusinessView } from '../../merchant/shared-kernel/command-gate'
import type { LocationId } from './ids'
import type { Location } from '../locations/domain/location'

export interface MerchantAccess {
  membership: MembershipView
  business: BusinessView
  capabilities: ReadonlySet<string>
}

export interface MerchantAccessPort {
  resolveAccess(tx: Tx, userId: string, businessId: string): Promise<Result<MerchantAccess, DomainError>>
}

export interface LocationRepository {
  insert(tx: Tx, location: Location): Promise<void>
  update(tx: Tx, location: Location): Promise<void>
  findById(tx: Tx, id: LocationId, options?: { forUpdate?: boolean }): Promise<Location | null>
  listByBusiness(tx: Tx, businessId: string): Promise<Location[]>
  findDefault(tx: Tx, businessId: string): Promise<Location | null>
}

/**
 * L2's stock question. Batch 1 truth: the stock ledger does not exist yet, so no
 * location can hold stock — the composition root binds `noStockRecordedYet` (an honest
 * statement of current reality, replaced by the real stock_items query in Batch 2).
 */
export interface StockAtLocationPort {
  hasStock(tx: Tx, locationId: LocationId): Promise<boolean>
}

export interface OperationsDeps {
  uow: UnitOfWork
  locations: LocationRepository
  stockAtLocation: StockAtLocationPort
  merchantAccess: MerchantAccessPort
  eventStore: EventStore
  audit: AuditLog
}
