import type { Tx, StorefrontConfigRepository } from '../domain/ports'
import type { BusinessId, StoreId } from '../../shared-kernel/ids'
import { uuidv7 } from '../../shared-kernel/uuid'
import { asClient } from '@platform/db'

export class PgStorefrontConfigRepository implements StorefrontConfigRepository {
  async insertDefault(tx: Tx, input: { storeId: StoreId; businessId: BusinessId; themeKey: string }): Promise<void> {
    await asClient(tx).query(
      `INSERT INTO storefront_configs (id, store_id, business_id, theme_key, draft_config)
       VALUES ($1, $2, $3, $4, '{}')`,
      [uuidv7(), input.storeId, input.businessId, input.themeKey],
    )
  }

  async existsForStore(tx: Tx, storeId: StoreId): Promise<boolean> {
    const { rows } = await asClient(tx).query('SELECT 1 FROM storefront_configs WHERE store_id = $1', [storeId])
    return rows.length > 0
  }
}
