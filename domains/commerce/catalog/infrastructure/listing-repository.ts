/**
 * PgListingRepository (VISIBILITY_CONTRACT). Persistence-only: the aggregate owns the
 * machine; this stores what it decides. findForUpdate locks the row for transition
 * commands; listByProduct serves the auto-end consumer; countPublishedForChannel is
 * the store-publish readiness fact (activates the dormant clause in PR-2).
 */
import type { Tx } from '../../../../platform/types'
import { asClient } from '../../../../platform/db'
import { Listing, type ListingStatus } from '../domain/listing'

interface Row {
  id: string; business_id: string; product_id: string; channel_id: string
  status: string; published_at: Date | null; ended_at: Date | null
}

const COLUMNS = 'id, business_id, product_id, channel_id, status, published_at, ended_at'

const rehydrate = (r: Row): Listing => Listing.rehydrate({
  id: r.id, businessId: r.business_id, productId: r.product_id, channelId: r.channel_id,
  status: r.status as ListingStatus, publishedAt: r.published_at, endedAt: r.ended_at,
})

export class PgListingRepository {
  async insert(tx: Tx, listing: Listing): Promise<void> {
    const p = listing.toProps()
    await asClient(tx).query(
      `INSERT INTO listings (id, business_id, product_id, channel_id, status, published_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [p.id, p.businessId, p.productId, p.channelId, p.status, p.publishedAt, p.endedAt])
  }

  async update(tx: Tx, listing: Listing): Promise<void> {
    const p = listing.toProps()
    await asClient(tx).query(
      `UPDATE listings SET status = $2, published_at = $3, ended_at = $4, updated_at = now() WHERE id = $1`,
      [p.id, p.status, p.publishedAt, p.endedAt])
  }

  async findByProductAndChannel(tx: Tx, productId: string, channelId: string, opts?: { forUpdate?: boolean }): Promise<Listing | null> {
    const { rows } = await asClient(tx).query<Row>(
      `SELECT ${COLUMNS} FROM listings WHERE product_id = $1 AND channel_id = $2${opts?.forUpdate ? ' FOR UPDATE' : ''}`,
      [productId, channelId])
    return rows[0] ? rehydrate(rows[0]) : null
  }

  async listByProduct(tx: Tx, productId: string, opts?: { forUpdate?: boolean }): Promise<Listing[]> {
    const { rows } = await asClient(tx).query<Row>(
      `SELECT ${COLUMNS} FROM listings WHERE product_id = $1${opts?.forUpdate ? ' FOR UPDATE' : ''}`, [productId])
    return rows.map(rehydrate)
  }

  /** The store-publish readiness fact (PublishableStoreSpec's dormant clause, PR-2). */
  async countPublishedForChannel(tx: Tx, channelId: string): Promise<number> {
    const { rows } = await asClient(tx).query<{ n: string }>(
      `SELECT count(*) AS n FROM listings WHERE channel_id = $1 AND status = 'published'`, [channelId])
    return Number(rows[0]!.n)
  }
}
