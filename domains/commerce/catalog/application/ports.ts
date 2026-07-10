/**
 * Commerce application ports (IMP-COM-001B). MerchantAccessPort is the in-monolith face
 * of the frozen Merchant Query API (ADR-003 F3): commerce asks "who is this actor at this
 * business, and what may the business do?" and runs the triple gate itself with the answer.
 * Commerce NEVER imports merchant/core — the adapter lives in the composition root
 * (server/utils/merchant-access.ts), which may touch both domains.
 * NOT_FOUND masking is part of the contract: unknown business OR no membership answers
 * the same way (existence is information — kernel law).
 */
import type { Result } from '../../../../shared/result'
import type { DomainError } from '../../../../shared/errors'
import type { Tx, UnitOfWork, EventStore, AuditLog } from '../../../../platform/types'
import type { MembershipView, BusinessView } from '../../../merchant/shared-kernel/command-gate'
import type { ProductRepository } from '../domain/ports'
import type { PgProductReadDao } from '../infrastructure/product-read-dao'

export interface MerchantAccess {
  membership: MembershipView
  business: BusinessView
  capabilities: ReadonlySet<string>
}

export interface MerchantAccessPort {
  /** Resolve actor context at a business; NOT_FOUND for unknown business AND non-members alike. */
  resolveAccess(tx: Tx, userId: string, businessId: string): Promise<Result<MerchantAccess, DomainError>>
}

export interface CommerceDeps {
  uow: UnitOfWork
  products: ProductRepository
  productReads: PgProductReadDao
  merchantAccess: MerchantAccessPort
  eventStore: EventStore
  audit: AuditLog
}

/** Products-per-business caps by scale tier (BLUEPRINT §4 TIER_LIMIT_REACHED; policy data, not physics). */
export const PRODUCT_TIER_LIMITS: Record<string, number> = {
  starter: 250,
  growth: 5_000,
  established: 50_000,
  enterprise: Number.MAX_SAFE_INTEGER,
}
