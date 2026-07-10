/**
 * BrandKit VO (ADR-001 v1.1: renamed from Brand — "Brand" is a Platform Bible persona).
 * Whole-value semantics: replaced entirely, never partially mutated (PUT, not PATCH).
 */
import { type Result, ok, err } from '../../../shared/result'
import { type DomainError, domainError } from '../../../shared/errors'
import { isUuid } from './uuid'
import type { MediaId } from './ids'
import type { AIProvenance } from './ai-provenance'
import { EMPTY_PROVENANCE } from './ai-provenance'

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export interface BrandKit {
  readonly name: string
  readonly logoMediaId: MediaId | null
  readonly palette: Readonly<Record<string, string>> // role → hex, e.g. { primary: '#ff4500' }
  readonly typography: Readonly<Record<string, string>> // role → font family key
  readonly voice: Readonly<{ tone?: string; keywords?: readonly string[] }>
  readonly aiProvenance: AIProvenance
}

export interface BrandKitInput {
  name: string
  logoMediaId?: string | null
  palette?: Record<string, string>
  typography?: Record<string, string>
  voice?: { tone?: string; keywords?: string[] }
  aiProvenance?: AIProvenance
}

export function createBrandKit(input: BrandKitInput): Result<BrandKit, DomainError> {
  const name = input.name?.trim()
  if (!name || name.length > 80) {
    return err(domainError('VALIDATION_FAILED', 'brand kit name must be 1–80 characters'))
  }
  if (input.logoMediaId != null && !isUuid(input.logoMediaId)) {
    return err(domainError('VALIDATION_FAILED', 'logoMediaId must be a UUID (MediaRef id)'))
  }
  const palette = input.palette ?? {}
  for (const [role, color] of Object.entries(palette)) {
    if (!HEX_COLOR_RE.test(color)) {
      return err(domainError('VALIDATION_FAILED', `palette.${role} must be a #rrggbb hex color`))
    }
  }
  return ok(Object.freeze({
    name,
    logoMediaId: (input.logoMediaId ?? null) as MediaId | null,
    palette: Object.freeze({ ...palette }),
    typography: Object.freeze({ ...(input.typography ?? {}) }),
    voice: Object.freeze({ ...(input.voice ?? {}) }),
    aiProvenance: input.aiProvenance ?? EMPTY_PROVENANCE,
  }))
}
