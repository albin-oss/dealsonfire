/**
 * Sliding-window rate limiter behind a port (BLUEPRINT §9). Per-instance in-memory for
 * Module 1 (DECISIONS D-08); the Vercel KV adapter replaces MemoryRateLimiter without
 * touching call sites.
 */
export interface RateLimiterPort {
  allow(key: string, limit: number, windowSeconds: number): boolean
}

/** BLUEPRINT §9 global authed default, applied by the endpoint wrappers on top of per-endpoint limits. */
export const GLOBAL_RATE_LIMIT = { limit: 300, windowSeconds: 60 }

const MAX_KEYS = 50_000

export class MemoryRateLimiter implements RateLimiterPort {
  private hits = new Map<string, number[]>()

  allow(key: string, limit: number, windowSeconds: number): boolean {
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
