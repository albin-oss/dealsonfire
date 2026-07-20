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
  /** Feedback (Release 1.2): fires earned on sparks + deals in the last 7 days. */
  fires_this_week: number
  /** Feedback (Release 1.2): new followers in the last 7 days. */
  new_followers_this_week: number
  /** Hours since the business last published a spark or deal; null = never. */
  hours_quiet: number | null
  /** Newest on-store product no spark has ever pointed at (visible ones only). */
  unsparked_product: { id: string; title: string } | null
}

export async function merchantMomentum(tx: Tx, businessId: string): Promise<MerchantMomentum> {
  const client = asClient(tx)
  const [followers, quiet, unsparked, firesWeek, followersWeek] = await Promise.all([
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
    client.query<{ n: number }>(
      `SELECT (
         (SELECT count(*) FROM spark_reactions r JOIN sparks sp ON sp.id = r.spark_id
          WHERE sp.business_id = $1 AND r.created_at > now() - interval '7 days')
         +
         (SELECT count(*) FROM deal_reactions r JOIN deals d ON d.id = r.deal_id
          WHERE d.business_id = $1 AND r.created_at > now() - interval '7 days')
       )::int AS n`,
      [businessId]),
    client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM store_follows f
       JOIN stores s ON s.id = f.store_id
       WHERE s.business_id = $1 AND s.deleted_at IS NULL
         AND f.created_at > now() - interval '7 days'`,
      [businessId]),
  ])
  return {
    followers: Number(followers.rows[0]?.n ?? 0),
    fires_this_week: Number(firesWeek.rows[0]?.n ?? 0),
    new_followers_this_week: Number(followersWeek.rows[0]?.n ?? 0),
    hours_quiet: quiet.rows[0]?.hours ?? null,
    unsparked_product: unsparked.rows[0] ?? null,
  }
}
