/**
 * The three orthogonal merchant axes (ADR-001 §0.3 / §6). These orderings are the
 * single source of truth for every "at least X" comparison in the platform.
 */
export const TRUST_LEVELS = ['unverified', 'identity_verified', 'business_verified', 'banking_verified'] as const
export type TrustLevel = (typeof TRUST_LEVELS)[number]

export const SCALE_TIERS = ['starter', 'growth', 'established', 'enterprise'] as const
export type ScaleTier = (typeof SCALE_TIERS)[number]

export const STANDINGS = ['good', 'flagged', 'restricted', 'suspended', 'banned'] as const
export type Standing = (typeof STANDINGS)[number]

export const meetsTrust = (actual: TrustLevel, required: TrustLevel): boolean =>
  TRUST_LEVELS.indexOf(actual) >= TRUST_LEVELS.indexOf(required)

export const meetsTier = (actual: ScaleTier, required: ScaleTier): boolean =>
  SCALE_TIERS.indexOf(actual) >= SCALE_TIERS.indexOf(required)

/** Standings that block ALL merchant writes (ADR §6: consequences cascade). */
export const WRITE_BLOCKING_STANDINGS: readonly Standing[] = ['suspended', 'banned']
/** Standings that additionally block outward-facing growth operations (publish, offers). */
export const GROWTH_BLOCKING_STANDINGS: readonly Standing[] = ['restricted', 'suspended', 'banned']
