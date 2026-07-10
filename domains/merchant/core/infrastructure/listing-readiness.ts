/**
 * Module 1 ListingReadinessPort adapter (DECISIONS D-03): Catalog is not installed yet,
 * so the PublishableStoreSpec listing clause is dormant. Module 2 replaces this adapter
 * with one that counts published listings — no spec or command change required.
 */
import type { Tx, ListingReadinessPort } from '../domain/ports'
import type { StoreId } from '../../shared-kernel/ids'

export class CatalogAbsentListingReadiness implements ListingReadinessPort {
  async forStore(_tx: Tx, _storeId: StoreId): Promise<{ catalogAvailable: boolean; publishedListingCount: number }> {
    return { catalogAvailable: false, publishedListingCount: 0 }
  }
}
