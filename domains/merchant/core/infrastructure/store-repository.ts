import type { Tx, StoreRepository } from '../domain/ports'
import { Store, type StoreStatus, type EnforcementHold } from '../domain/store'
import { asBusinessId, asStoreId, type BusinessId, type StoreId } from '../../shared-kernel/ids'
import type { Handle } from '../../shared-kernel/handle'
import { asClient } from '@platform/db'

interface Row {
  id: string
  business_id: string
  handle: string
  name: string
  status: StoreStatus
  enforcement_hold: EnforcementHold
  pause_context: Record<string, unknown> | null
  policies: Record<string, unknown>
  completion_score: number
  settings: Record<string, unknown>
  published_at: Date | null
}

const COLUMNS = 'id, business_id, handle, name, status, enforcement_hold, pause_context, policies, completion_score, settings, published_at'

const rehydrate = (row: Row): Store =>
  Store.rehydrate({
    id: asStoreId(row.id),
    businessId: asBusinessId(row.business_id),
    handle: row.handle as Handle,
    name: row.name,
    status: row.status,
    enforcementHold: row.enforcement_hold,
    pauseContext: row.pause_context,
    policies: row.policies,
    completionScore: row.completion_score,
    settings: row.settings,
    publishedAt: row.published_at,
  })

export class PgStoreRepository implements StoreRepository {
  async findById(tx: Tx, id: StoreId, opts?: { forUpdate?: boolean }): Promise<Store | null> {
    const { rows } = await asClient(tx).query<Row>(
      `SELECT ${COLUMNS} FROM stores WHERE id = $1 AND deleted_at IS NULL${opts?.forUpdate ? ' FOR UPDATE' : ''}`,
      [id],
    )
    return rows[0] ? rehydrate(rows[0]) : null
  }

  async countActiveByBusiness(tx: Tx, businessId: BusinessId): Promise<number> {
    const { rows } = await asClient(tx).query<{ count: string }>(
      `SELECT count(*)::text AS count FROM stores
       WHERE business_id = $1 AND status NOT IN ('closed','deleted') AND deleted_at IS NULL`,
      [businessId],
    )
    return Number(rows[0]?.count ?? 0)
  }

  async listByBusiness(tx: Tx, businessId: BusinessId): Promise<Store[]> {
    const { rows } = await asClient(tx).query<Row>(
      `SELECT ${COLUMNS} FROM stores WHERE business_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
      [businessId],
    )
    return rows.map(rehydrate)
  }

  async insert(tx: Tx, store: Store): Promise<void> {
    await asClient(tx).query(
      `INSERT INTO stores (id, business_id, handle, name, status, enforcement_hold, pause_context, policies, completion_score, settings, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [store.id, store.businessId, store.handle, store.name, store.status, store.enforcementHold,
       store.pauseContext, store.policies, store.completionScore, store.settings, store.publishedAt],
    )
  }

  async update(tx: Tx, store: Store): Promise<void> {
    await asClient(tx).query(
      `UPDATE stores SET name = $2, status = $3, enforcement_hold = $4, pause_context = $5,
         policies = $6, completion_score = $7, settings = $8, published_at = $9
       WHERE id = $1`,
      [store.id, store.name, store.status, store.enforcementHold, store.pauseContext,
       store.policies, store.completionScore, store.settings, store.publishedAt],
    )
  }
}
