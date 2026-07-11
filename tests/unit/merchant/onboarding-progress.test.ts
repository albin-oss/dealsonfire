/**
 * Onboarding progress engine (CAP-R1-MER-001) — pure unit tests. No I/O.
 */
import { describe, it, expect } from 'vitest'
import { computeOnboardingProgress, type MilestoneId } from '@domains/merchant/core/domain/onboarding-progress'

const statusOf = (p: ReturnType<typeof computeOnboardingProgress>, id: MilestoneId) =>
  p.milestones.find((m) => m.id === id)!.status

describe('computeOnboardingProgress', () => {
  it('a brand-new verified merchant: account+email done, business is next', () => {
    const p = computeOnboardingProgress({ emailVerified: true, hasBusiness: false, hasStore: false })
    expect(statusOf(p, 'account_created')).toBe('done')
    expect(statusOf(p, 'email_verified')).toBe('done')
    expect(statusOf(p, 'business_created')).toBe('next')
    expect(statusOf(p, 'store_created')).toBe('upcoming')
    expect(p.completedCount).toBe(2)
    expect(p.totalCount).toBe(8)
    expect(p.stepsToFirstSale).toBe(6)
    expect(p.nextMilestoneId).toBe('business_created')
  })

  it('unverified account: email is the next step, not account', () => {
    const p = computeOnboardingProgress({ emailVerified: false, hasBusiness: false, hasStore: false })
    expect(statusOf(p, 'account_created')).toBe('done')
    expect(statusOf(p, 'email_verified')).toBe('next')
    expect(p.completedCount).toBe(1)
    expect(p.nextMilestoneId).toBe('email_verified')
  })

  it('has a business + store: first_product becomes the next step (the first future rung)', () => {
    const p = computeOnboardingProgress({ emailVerified: true, hasBusiness: true, hasStore: true })
    expect(statusOf(p, 'business_created')).toBe('done')
    expect(statusOf(p, 'store_created')).toBe('done')
    expect(statusOf(p, 'first_product')).toBe('next')
    expect(p.completedCount).toBe(4)
    expect(p.stepsToFirstSale).toBe(4)
    expect(p.nextMilestoneId).toBe('first_product')
  })

  it('exactly one rung is ever "next" (Opportunity First)', () => {
    for (const facts of [
      { emailVerified: false, hasBusiness: false, hasStore: false },
      { emailVerified: true, hasBusiness: false, hasStore: false },
      { emailVerified: true, hasBusiness: true, hasStore: false },
      { emailVerified: true, hasBusiness: true, hasStore: true },
    ]) {
      const p = computeOnboardingProgress(facts)
      expect(p.milestones.filter((m) => m.status === 'next')).toHaveLength(1)
    }
  })

  it('future rungs are never marked done (they are the honest roadmap)', () => {
    const p = computeOnboardingProgress({ emailVerified: true, hasBusiness: true, hasStore: true })
    for (const id of ['first_product', 'inventory_configured', 'shipping_configured', 'first_sale'] as MilestoneId[]) {
      expect(statusOf(p, id)).not.toBe('done')
    }
  })
})
