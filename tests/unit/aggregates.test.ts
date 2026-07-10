import { describe, it, expect } from 'vitest'
import { unwrap } from '@shared/result'
import { type Business } from '@domains/merchant/core/domain/business'
import { Store } from '@domains/merchant/core/domain/store'
import { createBusiness } from '@domains/merchant/core/domain/factories/business-factory'
import { createStore } from '@domains/merchant/core/domain/factories/store-factory'
import { StaffMembership } from '@domains/merchant/core/domain/staff-membership'
import { checkPublishable } from '@domains/merchant/core/domain/specifications/publishable-store-specification'
import { EVENT } from '@domains/merchant/core/domain/events'
import type { Actor } from '@domains/merchant/shared-kernel/actor'
import type { Handle } from '@domains/merchant/shared-kernel/handle'
import { asBusinessId, asStoreId } from '@domains/merchant/shared-kernel/ids'
import { uuidv7 } from '@domains/merchant/shared-kernel/uuid'

const user: Actor = { type: 'user', id: uuidv7() }
const admin: Actor = { type: 'admin', id: 'admin-1' }

const newBusiness = (): Business =>
  unwrap(createBusiness({ displayName: 'Rosa Knits', businessType: 'individual', actor: user })).business

const readiness = { name: 'Rosa Knits', hasBrandKit: true, hasPolicies: true, listings: { catalogAvailable: false, publishedListingCount: 0 } }

describe('Business — three orthogonal axes (ADR §0.3)', () => {
  it('is born at the origin: unverified / starter / good', () => {
    const business = newBusiness()
    expect([business.trustLevel, business.scaleTier, business.standing]).toEqual(['unverified', 'starter', 'good'])
  })

  it('standing can only be changed by admin/system actors', () => {
    const business = newBusiness()
    const denied = business.changeStanding('suspended', 'fraud_signals', user)
    expect(!denied.ok && denied.error.code).toBe('PERMISSION_DENIED')
    expect(business.changeStanding('suspended', 'fraud_signals', admin).ok).toBe(true)
    expect(business.standing).toBe('suspended')
    expect(business.pullPendingEvents().map((e) => e.eventType)).toContain(EVENT.BUSINESS_STANDING_CHANGED)
  })

  it('trust level advances one step at a time, never skipped (ADR §10)', () => {
    const business = newBusiness()
    const skipped = business.raiseTrustLevel('business_verified', admin)
    expect(!skipped.ok && skipped.error.code).toBe('INVALID_TRANSITION')
    expect(business.raiseTrustLevel('identity_verified', admin).ok).toBe(true)
    expect(business.raiseTrustLevel('business_verified', admin).ok).toBe(true)
  })
})

describe('Store — status ⊥ enforcement hold (ADR §7.2)', () => {
  const newStore = () =>
    unwrap(createStore({ businessId: asBusinessId(uuidv7()), name: 'Rosa Knits', handle: 'rosa-knits', actor: user })).store

  it('publishes a ready draft and emits store.published exactly once', () => {
    const store = newStore()
    expect(store.publish(readiness, user, { name: 'Rosa Knits', palette: {} }).ok).toBe(true)
    expect(store.status).toBe('live')
    expect(store.publishedAt).not.toBeNull()
    const events = store.pullPendingEvents()
    expect(events.map((e) => e.eventType)).toEqual([EVENT.STORE_PUBLISHED])
    // idempotent republish: no error, no second event
    expect(store.publish(readiness, user, null).ok).toBe(true)
    expect(store.pullPendingEvents()).toHaveLength(0)
  })

  it('resume-from-paused emits store.resumed, NOT a second launch (REVIEW-001 M-2)', () => {
    // A paused store necessarily has publish history — rehydrate that state directly
    // (the pause API arrives in a later module).
    const paused = Store.rehydrate({
      id: asStoreId(uuidv7()),
      businessId: asBusinessId(uuidv7()),
      handle: 'paused-store' as Handle,
      name: 'Paused Store',
      status: 'paused',
      enforcementHold: 'none',
      pauseContext: { reason: 'vacation' },
      policies: { returns: {} },
      completionScore: 40,
      settings: {},
      publishedAt: new Date('2026-01-01'),
    })
    expect(paused.publish(readiness, user, null).ok).toBe(true)
    expect(paused.status).toBe('live')
    expect(paused.pauseContext).toBeNull()
    const events = paused.pullPendingEvents()
    expect(events.map((e) => e.eventType)).toEqual([EVENT.STORE_RESUMED])
  })

  it('enforcement hold answers before readiness (423 beats 409)', () => {
    const store = newStore()
    expect(store.setEnforcementHold('under_review', 'listing_reports', admin).ok).toBe(true)
    const result = store.publish({ ...readiness, hasBrandKit: false }, user, null)
    expect(!result.ok && result.error.code).toBe('ENFORCEMENT_HOLD')
  })

  it('not-ready store fails with an explainable missing list', () => {
    const store = newStore()
    const result = store.publish({ ...readiness, hasBrandKit: false }, user, null)
    expect(!result.ok && result.error.code).toBe('STORE_NOT_PUBLISHABLE')
    if (!result.ok) expect((result.error.details as { missing: string[] }).missing).toContain('brand kit')
  })

  it('holds are admin/system-only and do not touch status (orthogonality)', () => {
    const store = newStore()
    expect(store.publish(readiness, user, null).ok).toBe(true)
    store.pullPendingEvents()
    const denied = store.setEnforcementHold('suspended', 'x', user)
    expect(!denied.ok && denied.error.code).toBe('PERMISSION_DENIED')
    expect(store.setEnforcementHold('suspended', 'standing_consequence', admin).ok).toBe(true)
    expect(store.status).toBe('live') // hold does NOT change merchant intent
    expect(store.enforcementHold).toBe('suspended')
  })
})

describe('PublishableStoreSpec listing clause (DECISIONS D-03)', () => {
  it('skips the listing clause while catalog is absent, enforces it when present', () => {
    expect(checkPublishable({ ...readiness, listings: { catalogAvailable: false, publishedListingCount: 0 } }).ok).toBe(true)
    const withCatalog = checkPublishable({ ...readiness, listings: { catalogAvailable: true, publishedListingCount: 0 } })
    expect(!withCatalog.ok && withCatalog.error.code).toBe('STORE_NOT_PUBLISHABLE')
    expect(checkPublishable({ ...readiness, listings: { catalogAvailable: true, publishedListingCount: 3 } }).ok).toBe(true)
  })
})

describe('StaffMembership invariants', () => {
  const businessId = asBusinessId(uuidv7())

  it('owner cannot be granted by invitation', () => {
    const result = StaffMembership.create({ businessId, principalType: 'user', principalId: uuidv7(), roles: ['owner'] })
    expect(!result.ok && result.error.code).toBe('VALIDATION_FAILED')
  })

  it('ai_agent principals may only hold ai_assistant', () => {
    const bad = StaffMembership.create({ businessId, principalType: 'ai_agent', principalId: uuidv7(), roles: ['manager'] })
    expect(bad.ok).toBe(false)
    const good = StaffMembership.create({ businessId, principalType: 'ai_agent', principalId: uuidv7(), roles: ['ai_assistant'] })
    expect(good.ok && good.value.status).toBe('active')
  })

  it('the owner membership cannot be revoked (transfer instead)', () => {
    const owner = StaffMembership.createOwner(businessId, uuidv7(), user)
    const result = owner.revoke()
    expect(!result.ok && result.error.code).toBe('CONFLICT')
  })

  it('non-owner revoke works and is idempotent', () => {
    const staff = unwrap(StaffMembership.create({ businessId, principalType: 'user', principalId: uuidv7(), roles: ['staff'] }))
    expect(staff.revoke().ok).toBe(true)
    expect(staff.status).toBe('revoked')
    expect(staff.revoke().ok).toBe(true)
  })
})
