/**
 * Recommendation engine (CAP-R1-MER-002). PURE, rule-based (no generative AI): it reads the
 * discovery answers and proposes how to tailor DOF — a suggested business type, the commerce
 * modules worth turning on, a marketplace-readiness score, a dashboard layout, and the one
 * next step (always: create the business). Deterministic and fully unit-testable.
 */
import type { OnboardingAnswers } from './answers'

export type BusinessTypeSuggestion = 'maker' | 'service' | 'retail' | 'digital' | 'general'
export type DashboardLayout = 'maker' | 'service' | 'retail' | 'digital' | 'starter'
export type CommerceModule =
  | 'inventory' | 'shipping' | 'scheduling' | 'rentals' | 'digital_delivery'
  | 'events' | 'memberships' | 'marketplace' | 'wholesale'

export interface Recommendation {
  suggested_business_type: BusinessTypeSuggestion
  dashboard_layout: DashboardLayout
  recommended_modules: CommerceModule[]
  marketplace_readiness_score: number // 0–100
  suggested_store_config: { needs_shipping: boolean; needs_scheduling: boolean; digital_first: boolean }
  next_step: 'create_business'
}

const has = <T>(arr: T[] | undefined, v: T): boolean => Array.isArray(arr) && arr.includes(v)

/** Business type: the dominant intent from what they sell. Order matters — first match wins. */
function suggestBusinessType(a: OnboardingAnswers): BusinessTypeSuggestion {
  const s = a.sell_types ?? []
  if (has(s, 'handmade')) return 'maker'
  if (has(s, 'services') || has(s, 'appointments')) return 'service'
  if (has(s, 'digital') || has(s, 'courses') || has(s, 'memberships')) return 'digital'
  if (has(s, 'physical') || has(s, 'rentals') || has(s, 'events')) return 'retail'
  return 'general'
}

function recommendModules(a: OnboardingAnswers): CommerceModule[] {
  const s = a.sell_types ?? []
  const mods = new Set<CommerceModule>()
  if (has(s, 'physical') || has(s, 'handmade')) { mods.add('inventory'); mods.add('shipping') }
  if (has(s, 'appointments') || has(s, 'services')) mods.add('scheduling')
  if (has(s, 'rentals')) mods.add('rentals')
  if (has(s, 'digital') || has(s, 'courses')) mods.add('digital_delivery')
  if (has(s, 'events')) mods.add('events')
  if (has(s, 'memberships')) mods.add('memberships')
  if (has(a.channels, 'marketplace')) mods.add('marketplace')
  if (has(a.channels, 'wholesale')) mods.add('wholesale')
  return [...mods].sort()
}

/**
 * Marketplace readiness (0–100): how ready they are to sell on the DOF marketplace today.
 * Rewards signals of an operating business; caps at 100. Curated weights, no black box.
 */
function marketplaceReadiness(a: OnboardingAnswers): number {
  let score = 0
  switch (a.business_stage) {
    case 'established': score += 40; break
    case 'existing': score += 30; break
    case 'starting': score += 15; break
    case 'exploring': score += 5; break
  }
  if ((a.sell_types?.length ?? 0) > 0) score += 15
  if (a.current_platform && a.current_platform !== 'none') score += 15 // has run a store before
  if (has(a.channels, 'marketplace') || has(a.channels, 'online')) score += 15
  switch (a.monthly_orders) {
    case '1000_plus': score += 15; break
    case '100_1000': score += 12; break
    case 'under_100': score += 6; break
    case 'just_starting': score += 2; break
  }
  return Math.min(100, score)
}

const LAYOUT: Record<BusinessTypeSuggestion, DashboardLayout> = {
  maker: 'maker', service: 'service', retail: 'retail', digital: 'digital', general: 'starter',
}

export function recommend(a: OnboardingAnswers): Recommendation {
  const type = suggestBusinessType(a)
  const modules = recommendModules(a)
  return {
    suggested_business_type: type,
    dashboard_layout: LAYOUT[type],
    recommended_modules: modules,
    marketplace_readiness_score: marketplaceReadiness(a),
    suggested_store_config: {
      needs_shipping: modules.includes('shipping'),
      needs_scheduling: modules.includes('scheduling'),
      digital_first: type === 'digital',
    },
    next_step: 'create_business',
  }
}
