/**
 * Catalog ports (IMP-COM-001 — contracts only; the PostgreSQL implementation ships in
 * the persistence sprint per BLUEPRINT-002 Batch 2's migration step).
 * Concurrency contract = the Merchant Kernel's, exactly: repositories load whole
 * aggregates with an optional row lock (`forUpdate`) for command transactions, and the
 * per-aggregate `sequence` UNIQUE guard at event append is the optimistic-concurrency
 * line — the aggregate itself carries no version field.
 */
import type { Tx } from '../../../../platform/types'
import type { BusinessId } from '../../../merchant/shared-kernel/ids'
import type { ProductId } from '../../shared-kernel/ids'
import type { Product } from './product'

export type { Tx } from '../../../../platform/types'

export interface ProductRepository {
  /** Whole-aggregate load (product + variants + media). `forUpdate` locks the root row. */
  findById(tx: Tx, id: ProductId, opts?: { forUpdate?: boolean }): Promise<Product | null>
  /** Whole-aggregate insert in the caller's transaction. */
  insert(tx: Tx, product: Product): Promise<void>
  /** Whole-aggregate save: the repository diffs/replaces children; callers never partial-write. */
  update(tx: Tx, product: Product): Promise<void>
  /** TierLimitPolicy input (products-per-business caps, BLUEPRINT-002 §4). */
  countActiveByBusiness(tx: Tx, businessId: BusinessId): Promise<number>
}
