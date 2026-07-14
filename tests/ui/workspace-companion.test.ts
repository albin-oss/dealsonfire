/**
 * Workspace Companion engine (PROMPT-022) — pure unit tests: posture derivation, THE
 * opportunity selection (with reasoning, and the graceful fallback), the Journey narrative
 * (only what happened — never locked slots), and the contextual fifth-slot mapping.
 */
import { describe, it, expect } from 'vitest'
import {
  derivePosture, selectOpportunity, journeyMoments, contextualFifthId,
} from '../../app/composables/workspace-companion'
import type { OnboardingProgressResponse } from '@contracts/schemas/merchant/onboarding.schema'

type MilestoneId = OnboardingProgressResponse['milestones'][number]['id']
const LADDER: MilestoneId[] = [
  'account_created', 'email_verified', 'business_created', 'store_created',
  'first_product', 'inventory_configured', 'shipping_configured', 'first_sale',
]

function progressAt(nextId: MilestoneId | null): OnboardingProgressResponse {
  const nextIndex = nextId === null ? LADDER.length : LADDER.indexOf(nextId)
  const milestones = LADDER.map((id, i) => ({
    id, status: (i < nextIndex ? 'done' : i === nextIndex ? 'next' : 'upcoming') as 'done' | 'next' | 'upcoming',
  }))
  return {
    milestones,
    completed_count: nextIndex,
    total_count: LADDER.length,
    steps_to_first_sale: LADDER.length - nextIndex,
    next_milestone_id: nextId,
  }
}

describe('derivePosture', () => {
  it('is coach until a first sale exists; operator after', () => {
    expect(derivePosture(null)).toBe('coach')
    expect(derivePosture(progressAt('first_product'))).toBe('coach')
    expect(derivePosture(progressAt(null))).toBe('operator') // whole ladder done incl. first_sale
  })
})

describe('selectOpportunity — one recommendation, reasoning always present', () => {
  it('maps each next milestone to its opportunity', () => {
    expect(selectOpportunity(progressAt('email_verified')).to).toBe('/verify')
    expect(selectOpportunity(progressAt('business_created')).to).toBe('/onboarding')
    expect(selectOpportunity(progressAt('store_created')).to).toBe('/ignite')
    expect(selectOpportunity(progressAt('first_product')).to).toBe('/products')
    expect(selectOpportunity(progressAt('first_sale')).id).toBe('share-store')
  })
  it('every opportunity carries a non-empty reasoning (the why is the contract)', () => {
    for (const next of ['email_verified', 'business_created', 'store_created', 'first_product', 'first_sale'] as MilestoneId[]) {
      const opp = selectOpportunity(progressAt(next))
      expect(opp.reasoning.length, opp.id).toBeGreaterThan(20)
      expect(opp.title, opp.id).not.toMatch(/!$/) // no urgency theatrics
    }
  })
  it('degrades to the standing Ignite invitation when progress is unavailable', () => {
    const fallback = selectOpportunity(null)
    expect(fallback.id).toBe('ignite')
    expect(fallback.to).toBe('/ignite')
  })
})

describe('journeyMoments — a narrative, never a scoreboard', () => {
  it('shows ONLY completed milestones, in order', () => {
    const moments = journeyMoments(progressAt('first_product'))
    expect(moments.map((m) => m.id)).toEqual(['account_created', 'email_verified', 'business_created', 'store_created'])
    expect(moments[3]!.label).toBe('Store published')
  })
  it('never includes next/upcoming rungs (no locked slots, no gamification)', () => {
    const moments = journeyMoments(progressAt('email_verified'))
    expect(moments.map((m) => m.id)).toEqual(['account_created'])
  })
  it('empty when progress is unavailable (the card stays silent)', () => {
    expect(journeyMoments(null)).toEqual([])
  })
})

describe('contextualFifthId — the mobile fifth slot earns its context', () => {
  it('maps module-shaped milestones and holds the default otherwise', () => {
    expect(contextualFifthId(progressAt('first_product'))).toBe('products')
    expect(contextualFifthId(progressAt('store_created'))).toBe('store')
    expect(contextualFifthId(progressAt('first_sale'))).toBe('deals')
    expect(contextualFifthId(progressAt('email_verified'))).toBeNull() // /verify is not a module — no swap
    expect(contextualFifthId(null)).toBeNull()
  })
})
