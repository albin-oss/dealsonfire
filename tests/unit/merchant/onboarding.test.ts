/**
 * Onboarding domain (CAP-R1-MER-002) — pure unit tests: answer sanitization, the
 * versioned/detected-change profile aggregate, and the rule-based recommendation engine.
 */
import { describe, it, expect } from 'vitest'
import { sanitizeAnswers } from '@domains/merchant/onboarding/domain/answers'
import { OnboardingProfile } from '@domains/merchant/onboarding/domain/profile'
import { recommend } from '@domains/merchant/onboarding/domain/recommendation'

describe('sanitizeAnswers', () => {
  it('accepts valid answers and drops unknown keys', () => {
    const r = sanitizeAnswers({ business_stage: 'starting', sell_types: ['handmade', 'physical'], junk: 'x' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.business_stage).toBe('starting')
      expect(r.value.sell_types).toEqual(['handmade', 'physical'])
      expect('junk' in r.value).toBe(false)
    }
  })
  it('rejects invalid enum values and duplicate multi-selects', () => {
    expect(sanitizeAnswers({ business_stage: 'unicorn' }).ok).toBe(false)
    expect(sanitizeAnswers({ channels: ['online', 'online'] }).ok).toBe(false)
    expect(sanitizeAnswers('nope').ok).toBe(false)
  })
})

describe('OnboardingProfile (versioned, detected-change)', () => {
  it('applies answers, bumps version only on real change', () => {
    const p = OnboardingProfile.start('u1')
    expect(p.version).toBe(0)
    expect(p.applyAnswers({ business_stage: 'starting' })).toBe(true)
    expect(p.version).toBe(1)
    expect(p.applyAnswers({ business_stage: 'starting' })).toBe(false) // no-op
    expect(p.version).toBe(1)
    expect(p.applyAnswers({ team_size: 'solo' })).toBe(true)
    expect(p.version).toBe(2)
  })
  it('completes once (idempotent) and stays editable', () => {
    const p = OnboardingProfile.start('u1')
    const now = new Date('2026-07-10T00:00:00Z')
    expect(p.complete(now)).toBe(true)
    expect(p.status).toBe('completed')
    expect(p.complete(now)).toBe(false)
    // still editable after completion
    expect(p.applyAnswers({ team_size: '2_5' })).toBe(true)
  })
  it('rehydration refuses a corrupt row', () => {
    expect(() => OnboardingProfile.rehydrate({ userId: '', answers: {}, status: 'in_progress', version: 0, completedAt: null })).toThrow(/corrupt/)
    expect(() => OnboardingProfile.rehydrate({ userId: 'u', answers: {}, status: 'zombie' as 'completed', version: 0, completedAt: null })).toThrow(/corrupt/)
    expect(() => OnboardingProfile.rehydrate({ userId: 'u', answers: {}, status: 'in_progress', version: -1, completedAt: null })).toThrow(/corrupt/)
  })
})

describe('recommend (rule-based)', () => {
  it('handmade → maker layout, inventory + shipping', () => {
    const r = recommend({ business_stage: 'starting', sell_types: ['handmade'] })
    expect(r.suggested_business_type).toBe('maker')
    expect(r.dashboard_layout).toBe('maker')
    expect(r.recommended_modules).toEqual(expect.arrayContaining(['inventory', 'shipping']))
    expect(r.next_step).toBe('create_business')
  })
  it('appointments → service + scheduling', () => {
    const r = recommend({ sell_types: ['appointments'] })
    expect(r.suggested_business_type).toBe('service')
    expect(r.recommended_modules).toContain('scheduling')
    expect(r.suggested_store_config.needs_scheduling).toBe(true)
  })
  it('digital courses → digital layout + digital delivery, digital_first', () => {
    const r = recommend({ sell_types: ['courses', 'digital'] })
    expect(r.suggested_business_type).toBe('digital')
    expect(r.recommended_modules).toContain('digital_delivery')
    expect(r.suggested_store_config.digital_first).toBe(true)
  })
  it('marketplace/wholesale channels add their modules', () => {
    const r = recommend({ sell_types: ['physical'], channels: ['marketplace', 'wholesale'] })
    expect(r.recommended_modules).toEqual(expect.arrayContaining(['marketplace', 'wholesale']))
  })
  it('readiness score rewards operating signals and caps at 100', () => {
    const low = recommend({ business_stage: 'exploring' }).marketplace_readiness_score
    const high = recommend({
      business_stage: 'established', sell_types: ['physical'], channels: ['online', 'marketplace'],
      current_platform: 'shopify', monthly_orders: '1000_plus',
    }).marketplace_readiness_score
    expect(low).toBeLessThan(high)
    expect(high).toBeLessThanOrEqual(100)
    expect(high).toBe(100)
  })
  it('empty answers → general/starter, no modules, always create_business next', () => {
    const r = recommend({})
    expect(r.suggested_business_type).toBe('general')
    expect(r.dashboard_layout).toBe('starter')
    expect(r.recommended_modules).toEqual([])
    expect(r.next_step).toBe('create_business')
  })
})
