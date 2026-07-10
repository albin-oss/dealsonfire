/**
 * Design-system API contracts (DESIGN-SYSTEM-001 §1.3): the prop enums every
 * component types against. These are the CONTRACT tier — token *names* live in
 * tokens.generated.ts (derived from CSS); these are the roles components expose.
 */

/** Semantic color role of a component instance. `ember` is reserved for heat. */
export const TONES = ['neutral', 'accent', 'positive', 'caution', 'critical', 'info', 'ember'] as const
export type Tone = (typeof TONES)[number]

export const SIZES = ['sm', 'md', 'lg'] as const
export type Size = (typeof SIZES)[number]

export const VARIANTS = ['solid', 'soft', 'outline', 'ghost'] as const
export type Variant = (typeof VARIANTS)[number]

/** Bible §6.2 tempo bands — the only durations that exist. */
export const TEMPOS = ['instant', 'quick', 'deliberate', 'celebration'] as const
export type Tempo = (typeof TEMPOS)[number]

/** ADR-005 §2.2 reversibility classes — a UI concept (DS-5, §0.6). */
export const R_CLASSES = ['R0', 'R1', 'R2', 'R3'] as const
export type RClass = (typeof R_CLASSES)[number]

/** Theme scopes and modes (DS-2; marketplace/admin are thin platform resolutions — D-34). */
export const SCOPES = ['workspace', 'storefront', 'marketplace', 'admin'] as const
export type Scope = (typeof SCOPES)[number]
export const MODES = ['light', 'dark'] as const
export type Mode = (typeof MODES)[number]

/** Signature Moment intensity tiers (UX-BIBLE §14.2) — set by the registry, never chosen ad hoc. */
export const MOMENT_TIERS = ['ceremony', 'card', 'whisper'] as const
export type MomentTier = (typeof MOMENT_TIERS)[number]

/** Actor initiating a mutating pattern; R3 composables refuse 'ai' (ADR-001 §13.3). */
export type PatternActor = 'user' | 'ai'
