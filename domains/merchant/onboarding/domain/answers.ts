/**
 * Onboarding answer vocabulary (CAP-R1-MER-002). The bounded discovery questions and their
 * allowed values — the extensible, auditable profile the merchant builds by conversation.
 * Pure: validation only, no persistence, no auth coupling. Adding a value is additive; the
 * jsonb column keeps the shape open for future questions ("extensible").
 */
export const BUSINESS_STAGES = ['exploring', 'starting', 'existing', 'established'] as const
export const SELL_TYPES = ['physical', 'handmade', 'digital', 'services', 'appointments', 'rentals', 'events', 'courses', 'memberships', 'other'] as const
export const CHANNELS = ['online', 'physical_store', 'social', 'marketplace', 'wholesale'] as const
export const PLATFORMS = ['none', 'shopify', 'woocommerce', 'etsy', 'amazon', 'square', 'other'] as const
export const TEAM_SIZES = ['solo', '2_5', '6_20', '20_plus'] as const
export const MONTHLY_ORDERS = ['just_starting', 'under_100', '100_1000', '1000_plus'] as const

export type BusinessStage = typeof BUSINESS_STAGES[number]
export type SellType = typeof SELL_TYPES[number]
export type Channel = typeof CHANNELS[number]
export type Platform = typeof PLATFORMS[number]
export type TeamSize = typeof TEAM_SIZES[number]
export type MonthlyOrders = typeof MONTHLY_ORDERS[number]

/** Everything is optional — the merchant may save partway and resume, and skip optional
 *  questions. A completed profile is defined by status, not by which answers are present. */
export interface OnboardingAnswers {
  business_stage?: BusinessStage
  sell_types?: SellType[]
  channels?: Channel[]
  current_platform?: Platform
  team_size?: TeamSize
  monthly_orders?: MonthlyOrders
}

const inSet = <T extends string>(set: readonly T[], v: unknown): v is T => typeof v === 'string' && (set as readonly string[]).includes(v)
const subsetOf = <T extends string>(set: readonly T[], v: unknown): v is T[] =>
  Array.isArray(v) && v.every((x) => inSet(set, x)) && new Set(v).size === v.length

/** Validate & normalize an untrusted partial answer patch. Unknown keys are dropped;
 *  invalid values reject. Returns the clean patch or an error string (application maps it). */
export function sanitizeAnswers(input: unknown): { ok: true; value: OnboardingAnswers } | { ok: false; error: string } {
  if (input === null || typeof input !== 'object') return { ok: false, error: 'answers must be an object' }
  const raw = input as Record<string, unknown>
  const out: OnboardingAnswers = {}

  if ('business_stage' in raw) {
    if (!inSet(BUSINESS_STAGES, raw.business_stage)) return { ok: false, error: 'invalid business_stage' }
    out.business_stage = raw.business_stage
  }
  if ('sell_types' in raw) {
    if (!subsetOf(SELL_TYPES, raw.sell_types)) return { ok: false, error: 'invalid sell_types' }
    out.sell_types = raw.sell_types
  }
  if ('channels' in raw) {
    if (!subsetOf(CHANNELS, raw.channels)) return { ok: false, error: 'invalid channels' }
    out.channels = raw.channels
  }
  if ('current_platform' in raw) {
    if (!inSet(PLATFORMS, raw.current_platform)) return { ok: false, error: 'invalid current_platform' }
    out.current_platform = raw.current_platform
  }
  if ('team_size' in raw) {
    if (!inSet(TEAM_SIZES, raw.team_size)) return { ok: false, error: 'invalid team_size' }
    out.team_size = raw.team_size
  }
  if ('monthly_orders' in raw) {
    if (!inSet(MONTHLY_ORDERS, raw.monthly_orders)) return { ok: false, error: 'invalid monthly_orders' }
    out.monthly_orders = raw.monthly_orders
  }
  return { ok: true, value: out }
}
