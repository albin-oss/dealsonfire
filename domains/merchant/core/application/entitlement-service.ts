/**
 * EntitlementService (ADR-001 §5.3) — resolves a business's effective capabilities:
 *   effective = (registry defaults at tier+trust ∪ live explicit grants) filtered by
 *   dependency closure. Explicit grants bypass TIER but never TRUST (DECISIONS D-06).
 * Runtime face of the Capability Registry; short-TTL cached (registry changes are rare
 * and axis changes don't happen through kernel commands yet — see BLUEPRINT §10 L2).
 */
import type { Tx, CapabilityRepository, CapabilityDefinition } from '../domain/ports'
import type { Business } from '../domain/business'
import { meetsTier, meetsTrust } from '../../shared-kernel/trust'

const DEFINITIONS_TTL_MS = 60_000
const RESOLUTION_TTL_MS = 15_000
const RESOLUTION_CACHE_MAX = 5_000 // REVIEW-001 M-3: axis-including keys are self-invalidating but accumulate

export class EntitlementService {
  private definitionsCache: { value: CapabilityDefinition[]; expires: number } | null = null
  private resolutionCache = new Map<string, { value: ReadonlySet<string>; expires: number }>()

  constructor(private readonly repo: CapabilityRepository) {}

  async resolveEffective(tx: Tx, business: Business): Promise<ReadonlySet<string>> {
    const cacheKey = `${business.id}:${business.trustLevel}:${business.scaleTier}:${business.standing}`
    const cached = this.resolutionCache.get(cacheKey)
    if (cached && cached.expires > Date.now()) return cached.value

    const definitions = await this.definitions(tx)
    const explicit = new Set(await this.repo.liveEntitlementKeys(tx, business.id))

    const byKey = new Map(definitions.map((d) => [d.key, d]))
    const candidates = new Set<string>()
    for (const def of definitions) {
      const trustOk = meetsTrust(business.trustLevel, def.requiredTrustLevel)
      const tierOk = meetsTier(business.scaleTier, def.requiredScaleTier)
      if (def.defaultAvailable && trustOk && tierOk) candidates.add(def.key)
      else if (explicit.has(def.key) && trustOk) candidates.add(def.key) // grant bypasses tier, never trust
    }

    // Dependency closure: drop anything whose dependency chain isn't fully satisfied.
    let changed = true
    while (changed) {
      changed = false
      for (const key of candidates) {
        const def = byKey.get(key)
        if (def?.dependencies.some((dep) => !candidates.has(dep))) {
          candidates.delete(key)
          changed = true
        }
      }
    }

    const value: ReadonlySet<string> = candidates
    if (this.resolutionCache.size >= RESOLUTION_CACHE_MAX) {
      const now = Date.now()
      for (const [key, entry] of this.resolutionCache) {
        if (entry.expires <= now) this.resolutionCache.delete(key)
      }
      // Still full after sweeping expired: evict oldest-inserted until under the cap.
      while (this.resolutionCache.size >= RESOLUTION_CACHE_MAX) {
        const oldest = this.resolutionCache.keys().next().value
        if (oldest === undefined) break
        this.resolutionCache.delete(oldest)
      }
    }
    this.resolutionCache.set(cacheKey, { value, expires: Date.now() + RESOLUTION_TTL_MS })
    return value
  }

  /** Observability + test hook for the M-3 memory bound. */
  get cacheSize(): number {
    return this.resolutionCache.size
  }

  invalidate(businessId: string): void {
    for (const key of this.resolutionCache.keys()) {
      if (key.startsWith(`${businessId}:`)) this.resolutionCache.delete(key)
    }
  }

  private async definitions(tx: Tx): Promise<CapabilityDefinition[]> {
    if (this.definitionsCache && this.definitionsCache.expires > Date.now()) return this.definitionsCache.value
    const value = await this.repo.allDefinitions(tx)
    this.definitionsCache = { value, expires: Date.now() + DEFINITIONS_TTL_MS }
    return value
  }
}
