/**
 * store_handles ledger (BLUEPRINT §2.18): the source of truth for handle lifecycle.
 * Claim is atomic via INSERT … ON CONFLICT: succeeds only if the handle is unknown or
 * previously released. Expired Ignite reservations are reclaimable in place.
 */
import type { Tx, HandleLedger } from '../domain/ports'
import type { StoreId } from '../../shared-kernel/ids'
import { asClient } from '@platform/db'

export class PgHandleLedger implements HandleLedger {
  async claim(tx: Tx, handle: string, storeId: StoreId): Promise<boolean> {
    const { rows } = await asClient(tx).query<{ handle: string }>(
      `INSERT INTO store_handles (handle, store_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (handle) DO UPDATE
         SET store_id = EXCLUDED.store_id, status = 'active', reserved_until = NULL, quarantined_until = NULL
         WHERE store_handles.status = 'reserved' AND store_handles.reserved_until < now()
       RETURNING handle`,
      [handle, storeId],
    )
    return rows.length > 0
  }
}
