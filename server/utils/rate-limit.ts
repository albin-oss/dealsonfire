/**
 * Rate limiting behind a port (BLUEPRINT §9; durable adapter C12-2).
 *
 * The port is ASYNC (C12-2): the production adapter is Postgres-backed so
 * budgets survive restarts and are shared across instances. The in-memory
 * sliding-window limiter remains as the explicit dev/test binding.
 *
 * Key law (C12-2, binding): the durable adapter persists ONLY an HMAC digest
 * of the logical key — raw client addresses never touch disk. Address
 * normalization (IPv4 exact, IPv6 collapsed to its /64 prefix so in-prefix
 * rotation cannot evade a budget) happens where the address is read
 * (`normalizedClientAddress`), BEFORE the key is built.
 */
import { createHmac } from 'node:crypto'
import type pg from 'pg'

export interface RateLimiterPort {
  allow(key: string, limit: number, windowSeconds: number): Promise<boolean>
}

/** BLUEPRINT §9 global authed default, applied by the endpoint wrappers on top of per-endpoint limits. */
export const GLOBAL_RATE_LIMIT = { limit: 300, windowSeconds: 60 }

/** IPv4 exact; IPv6 → its /64 prefix (rotation inside a /64 is one budget). */
export function normalizeAddress(address: string): string {
  if (!address.includes(':')) return address // IPv4 (or opaque) — exact
  const expanded = address.split('%')[0]! // strip zone index
  const halves = expanded.split('::')
  const head = halves[0] ? halves[0].split(':').filter(Boolean) : []
  const tail = halves.length > 1 && halves[1] ? halves[1].split(':').filter(Boolean) : []
  const missing = 8 - head.length - tail.length
  const groups = [...head, ...Array(Math.max(0, missing)).fill('0'), ...tail]
    .map((g) => g.padStart(4, '0').toLowerCase())
  return groups.slice(0, 4).join(':') + '::/64'
}

const MAX_KEYS = 50_000

export class MemoryRateLimiter implements RateLimiterPort {
  private hits = new Map<string, number[]>()

  async allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = Date.now()
    const cutoff = now - windowSeconds * 1000
    const stamps = (this.hits.get(key) ?? []).filter((t) => t > cutoff)
    if (stamps.length >= limit) {
      this.hits.set(key, stamps)
      return false
    }
    stamps.push(now)
    this.hits.set(key, stamps)
    if (this.hits.size > MAX_KEYS) this.evict(now) // REVIEW-001 L-1: targeted eviction, never a global reset
    return true
  }

  /** Test-only: clear all windows (integration suites share one limiter + one source IP). */
  reset(): void {
    this.hits.clear()
  }

  private evict(now: number): void {
    // Drop keys whose newest stamp is stale (10 min); if that isn't enough, oldest-inserted go first.
    for (const [key, stamps] of this.hits) {
      const newest = stamps[stamps.length - 1] ?? 0
      if (newest < now - 600_000) this.hits.delete(key)
    }
    for (const key of this.hits.keys()) {
      if (this.hits.size <= MAX_KEYS) break
      this.hits.delete(key)
    }
  }
}

/**
 * C12-2 durable adapter: fixed-window counters in Postgres. One atomic upsert
 * per check — two racing instances land on the same row and both see honest
 * counts; a restart forgets nothing. Fixed-window (vs the memory adapter's
 * sliding window) is the deliberate durable trade: simpler contention story,
 * worst case one burst at a window boundary — acceptable at launch budgets.
 */
export class PgRateLimiter implements RateLimiterPort {
  constructor(private readonly pool: pg.Pool, private readonly hmacSecret: string) {}

  private digest(key: string): string {
    return createHmac('sha256', this.hmacSecret).update(key).digest('base64')
  }

  async allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const { rows } = await this.pool.query<{ count: number }>(
      `INSERT INTO rate_limit_buckets (key_hmac, window_start, count)
       VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / $2) * $2), 1)
       ON CONFLICT (key_hmac, window_start) DO UPDATE SET count = rate_limit_buckets.count + 1
       RETURNING count`,
      [this.digest(key), windowSeconds])
    const count = rows[0]?.count ?? 1
    if (count === 1 && Math.random() < 0.02) {
      // opportunistic retention: expired windows die on write, never by cron
      await this.pool.query(
        `DELETE FROM rate_limit_buckets WHERE window_start < now() - interval '2 hours'`).catch(() => {})
    }
    return count <= limit
  }
}
