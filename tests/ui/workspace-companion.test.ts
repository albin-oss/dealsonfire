/**
 * Workspace Companion engine (PROMPT-022) — pure unit tests: posture derivation, THE
 * opportunity selection (with reasoning, and the graceful fallback), the Journey narrative
 * (only what happened — never locked slots), and the contextual fifth-slot mapping.
 */
import { describe, it, expect } from 'vitest'
import {
  derivePosture, selectOpportunity, journeyMoments, contextualFifthId, pulseSentence,
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
    momentum: null,
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

describe('selectOpportunity — momentum (Release 0.8)', () => {
  const late = progressAt('first_sale')

  it('quiet store with followers → say good morning', () => {
    const progress = { ...late, momentum: { followers: 14, fires_this_week: 0, new_followers_this_week: 0, hours_quiet: 72, unsparked_product: null } }
    const opp = selectOpportunity(progress)
    expect(opp.id).toBe('morning-spark')
    expect(opp.reasoning).toContain('14 people follow')
    expect(opp.to).toBe('/sparks')
  })

  it('never-published store with followers → good morning (hours_quiet null)', () => {
    const progress = { ...late, momentum: { followers: 1, fires_this_week: 0, new_followers_this_week: 0, hours_quiet: null, unsparked_product: null } }
    const opp = selectOpportunity(progress)
    expect(opp.id).toBe('morning-spark')
    expect(opp.reasoning).toContain('1 person follows')
  })

  it('recently active → the unsparked product gets its moment (one-click hand-off)', () => {
    const progress = { ...late, momentum: { followers: 14, fires_this_week: 0, new_followers_this_week: 0, hours_quiet: 3, unsparked_product: { id: 'p-1', title: 'Wool Scarf' } } }
    const opp = selectOpportunity(progress)
    expect(opp.id).toBe('spark-product')
    expect(opp.title).toContain('Wool Scarf')
    expect(opp.to).toBe('/sparks?about=p-1')
  })

  it('no followers, nothing unsparked → share-store stands', () => {
    const progress = { ...late, momentum: { followers: 0, fires_this_week: 0, new_followers_this_week: 0, hours_quiet: null, unsparked_product: null } }
    expect(selectOpportunity(progress).id).toBe('share-store')
  })

  it('outranks the parked ladder: first_product + real momentum facts → spark, not "add a product"', () => {
    const progress = { ...progressAt('first_product'), momentum: { followers: 2, fires_this_week: 0, new_followers_this_week: 0, hours_quiet: 1, unsparked_product: { id: 'p-9', title: 'Pen' } } }
    const opp = selectOpportunity(progress)
    expect(opp.id).toBe('spark-product')
    expect(opp.to).toBe('/sparks?about=p-9')
  })

  it('first_product with NO momentum facts keeps the shelf prompt', () => {
    const progress = { ...progressAt('first_product'), momentum: { followers: 0, fires_this_week: 0, new_followers_this_week: 0, hours_quiet: null, unsparked_product: null } }
    expect(selectOpportunity(progress).id).toBe('first-product')
  })

  it('quiet beats unsparked: the audience waits first', () => {
    const progress = { ...late, momentum: { followers: 5, fires_this_week: 0, new_followers_this_week: 0, hours_quiet: 96, unsparked_product: { id: 'p-1', title: 'Wool Scarf' } } }
    expect(selectOpportunity(progress).id).toBe('morning-spark')
  })
})

describe('pulseSentence — the feedback loop (Release 1.2)', () => {
  const base = progressAt('first_sale')
  const withMomentum = (m: Partial<NonNullable<OnboardingProgressResponse['momentum']>>) => ({
    ...base,
    momentum: { followers: 0, fires_this_week: 0, new_followers_this_week: 0, hours_quiet: null, unsparked_product: null, ...m },
  })

  it('fires + new followers → the full "your words are working" sentence', () => {
    const pulse = pulseSentence(withMomentum({ fires_this_week: 8, new_followers_this_week: 2, followers: 5 }))
    expect(pulse!.sentence).toContain('8 fires')
    expect(pulse!.sentence).toContain('2 new people')
    expect(pulse!.to).toBe('/sparks')
  })

  it('new followers alone → they will see your next post', () => {
    const pulse = pulseSentence(withMomentum({ new_followers_this_week: 1, followers: 1 }))
    expect(pulse!.sentence).toContain('1 new person followed')
  })

  it('fires alone → people saw this', () => {
    const pulse = pulseSentence(withMomentum({ fires_this_week: 1 }))
    expect(pulse!.sentence).toContain('1 fire')
    expect(pulse!.sentence).toContain('people saw this')
  })

  it('quiet week with an audience → the standing fact', () => {
    const pulse = pulseSentence(withMomentum({ followers: 14 }))
    expect(pulse!.sentence).toContain('14 people follow')
  })

  it('nothing earned yet → null (the empty state keeps teaching)', () => {
    expect(pulseSentence(withMomentum({}))).toBeNull()
    expect(pulseSentence(null)).toBeNull()
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
