/**
 * Public storefront read (UX-IGNITE Phase 3). ONE question: "what does the world see at
 * dof.dev/:handle?" Answers only for LIVE stores with no enforcement hold — everything
 * else is null (the endpoint masks to 404; drafts and held stores are not enumerable).
 * Read-only, tenant-safe by construction: the handle is the public key, and the row
 * carries its own business scope. Redirect handles resolve to their target store.
 */
import type { Tx } from '../../../../platform/types'
import { asClient } from '../../../../platform/db'

export interface PublicStorefront {
  storeId: string
  businessId: string
  handle: string
  name: string
  publishedAt: string | null
  brand: { name: string; palette: Record<string, string>; tagline: string | null } | null
}

export class PgPublicStorefrontDao {
  async findLiveByHandle(tx: Tx, handle: string): Promise<PublicStorefront | null> {
    const { rows } = await asClient(tx).query<{
      store_id: string; business_id: string; handle: string; name: string
      published_at: Date | null; brand_name: string | null; palette: Record<string, string> | null
      voice: { tone?: string } | null
    }>(
      `SELECT s.id AS store_id, s.business_id, s.handle, s.name, s.published_at,
              b.name AS brand_name, b.palette, b.voice
       FROM stores s
       LEFT JOIN brand_kits b ON b.owner_type = 'store' AND b.owner_id = s.id
       WHERE s.handle = (
               -- follow one redirect hop in the handle ledger; plain handles pass through
               SELECT COALESCE(h.redirect_to_handle, h.handle)
               FROM store_handles h WHERE h.handle = $1 AND h.status IN ('active','redirect')
             )
         AND s.status = 'live' AND s.enforcement_hold = 'none' AND s.deleted_at IS NULL`,
      [handle],
    )
    const r = rows[0]
    if (!r) return null
    return {
      storeId: r.store_id,
      businessId: r.business_id,
      handle: r.handle,
      name: r.name,
      publishedAt: r.published_at ? r.published_at.toISOString() : null,
      brand: r.brand_name === null ? null : {
        name: r.brand_name,
        palette: r.palette ?? {},
        tagline: r.voice?.tone ?? null,
      },
    }
  }
}
