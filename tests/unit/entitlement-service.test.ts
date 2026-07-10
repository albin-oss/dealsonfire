import { describe, it, expect } from 'vitest'
import { unwrap } from '@shared/result'
import { EntitlementService } from '@domains/merchant/core/application/entitlement-service'
import { createBusiness } from '@domains/merchant/core/domain/factories/business-factory'
import type { CapabilityRepository, CapabilityDefinition } from '@domains/merchant/core/domain/ports'
import { uuidv7 } from '@domains/merchant/shared-kernel/uuid'

const DEFS: CapabilityDefinition[] = [
  { key: 'store.core', requiredTrustLevel: 'unverified', requiredScaleTier: 'starter', dependencies: [], defaultAvailable: true },
  { key: 'catalog.products', requiredTrustLevel: 'unverified', requiredScaleTier: 'starter', dependencies: ['store.core'], defaultAvailable: true },
  { key: 'staff.manage', requiredTrustLevel: 'identity_verified', requiredScaleTier: 'growth', dependencies: ['store.core'], defaultAvailable: true },
  { key: 'stores.multiple', requiredTrustLevel: 'business_verified', requiredScaleTier: 'established', dependencies: ['store.core'], defaultAvailable: true },
  { key: 'catalog.shared', requiredTrustLevel: 'business_verified', requiredScaleTier: 'established', dependencies: ['stores.multiple'], defaultAvailable: true },
]

function fakeRepo(grants: string[]): CapabilityRepository {
  return {
    allDefinitions: async () => DEFS,
    liveEntitlementKeys: async () => grants,
  }
}

const newBusiness = () =>
  unwrap(createBusiness({ displayName: 'B', businessType: 'individual', actor: { type: 'user', id: uuidv7() } })).business

describe('EntitlementService resolution (BLUEPRINT §5)', () => {
  it('starter/unverified gets defaults only', async () => {
    const service = new EntitlementService(fakeRepo([]))
    const caps = await service.resolveEffective({}, newBusiness())
    expect([...caps].sort()).toEqual(['catalog.products', 'store.core'])
  })

  it('explicit grant bypasses TIER but never TRUST (DECISIONS D-06)', async () => {
    const service = new EntitlementService(fakeRepo(['staff.manage', 'stores.multiple']))
    const business = newBusiness() // starter + unverified
    let caps = await service.resolveEffective({}, business)
    expect(caps.has('staff.manage')).toBe(false) // trust too low
    expect(caps.has('stores.multiple')).toBe(false)

    const admin = { type: 'admin' as const, id: 'a' }
    expect(business.raiseTrustLevel('identity_verified', admin).ok).toBe(true)
    service.invalidate(business.id)
    caps = await service.resolveEffective({}, business)
    expect(caps.has('staff.manage')).toBe(true) // tier bypassed by grant, trust now met
    expect(caps.has('stores.multiple')).toBe(false) // still needs business_verified
  })

  it('resolution cache stays bounded under many distinct businesses (REVIEW-001 M-3)', async () => {
    const service = new EntitlementService(fakeRepo([]))
    for (let i = 0; i < 5_100; i++) {
      await service.resolveEffective({}, newBusiness())
    }
    expect(service.cacheSize).toBeLessThanOrEqual(5_000)
  })

  it('dependency closure drops capabilities with unmet chains', async () => {
    // catalog.shared granted but its dependency stores.multiple is not available
    const service = new EntitlementService(fakeRepo(['catalog.shared']))
    const business = newBusiness()
    const admin = { type: 'admin' as const, id: 'a' }
    business.raiseTrustLevel('identity_verified', admin)
    business.raiseTrustLevel('business_verified', admin)
    const caps = await service.resolveEffective({}, business)
    expect(caps.has('catalog.shared')).toBe(false)
  })
})
