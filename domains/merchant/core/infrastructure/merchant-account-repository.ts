import type { Tx, MerchantAccountRepository } from '../domain/ports'
import { MerchantAccount, type MerchantAccountStatus } from '../domain/merchant-account'
import { asMerchantId, asUserId, type UserId } from '../../shared-kernel/ids'
import { asClient } from '@platform/db'

interface Row {
  id: string
  user_id: string
  display_name: string
  preferences: Record<string, unknown>
  status: MerchantAccountStatus
}

const rehydrate = (row: Row): MerchantAccount =>
  MerchantAccount.rehydrate({
    id: asMerchantId(row.id),
    userId: asUserId(row.user_id),
    displayName: row.display_name,
    preferences: row.preferences,
    status: row.status,
  })

export class PgMerchantAccountRepository implements MerchantAccountRepository {
  async findByUserId(tx: Tx, userId: UserId): Promise<MerchantAccount | null> {
    const { rows } = await asClient(tx).query<Row>(
      'SELECT id, user_id, display_name, preferences, status FROM merchant_accounts WHERE user_id = $1 AND deleted_at IS NULL',
      [userId],
    )
    return rows[0] ? rehydrate(rows[0]) : null
  }

  async insertIfAbsent(tx: Tx, account: MerchantAccount): Promise<boolean> {
    const { rows } = await asClient(tx).query(
      `INSERT INTO merchant_accounts (id, user_id, display_name, preferences, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING id`,
      [account.id, account.userId, account.displayName, account.preferences, account.status],
    )
    return rows.length > 0
  }
}
