/**
 * Merchant momentum (Release 0.8) — the facts behind "what should I publish today?",
 * computed entirely from existing tables (followers, sparks, deals, listings): no new
 * events, no scoring, no infrastructure. Guidance, not gamification — the numbers are
 * true and the suggestions are derivable by the merchant themselves.
 */
import { asClient } from '@platform/db'
import type { Tx } from '@platform/types'

export interface MerchantMomentum {
  /** People following any of this business's stores. */
  followers: number
  /** Hours since the business last published a spark or deal; null = never. */
  hours_quiet: number | null
  /** Newest on-store product no spark has ever pointed at (visible ones only). */
  unsparked_product: { id: string; title: string } | null
}

export async function merchantMomentum(tx: Tx, businessId: string): Promise<MerchantMomentum> {
  const client = asClient(tx)
  const [followers, quiet, unsparked] = await Promise.all([
    client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM store_follows f
       JOIN stores s ON s.id = f.store_id
       WHERE s.business_id = $1 AND s.deleted_at IS NULL`,
      [businessId]),
    client.query<{ hours: number | null }>(
      `SELECT floor(extract(epoch FROM now() - GREATEST(
         (SELECT max(published_at) FROM sparks WHERE business_id = $1 AND status = 'published'),
         (SELECT max(published_at) FROM deals WHERE business_id = $1 AND status = 'published')
       )) / 3600)::int AS hours`,
      [businessId]),
    client.query<{ id: string; title: string }>(
      `SELECT p.id, p.title
       FROM listings l
       JOIN products p ON p.id = l.product_id AND p.status <> 'archived' AND p.deleted_at IS NULL
       WHERE l.business_id = $1 AND l.status = 'published'
         AND NOT EXISTS (
           SELECT 1 FROM sparks sp
           WHERE sp.product_id = p.id AND sp.status = 'published'
         )
       ORDER BY l.published_at DESC
       LIMIT 1`,
      [businessId]),
  ])
  return {
    followers: Number(followers.rows[0]?.n ?? 0),
    hours_quiet: quiet.rows[0]?.hours ?? null,
    unsparked_product: unsparked.rows[0] ?? null,
  }
}
