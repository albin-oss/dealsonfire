/**
 * BrandKit → storefront scope bridge (DESIGN-SYSTEM-001 §2.6).
 * The storefront runtime calls `brandKitStyle()` with the merchant's saved BrandKit
 * theme and binds the result to the scope root (`<div data-scope="storefront" :style>`)
 * — the same sys roles re-resolve to the merchant's voice (DS-2).
 *
 * Domain-blind by law (§1.2): this module defines its own input shape; the app maps
 * the Merchant domain's BrandKit VO onto it at the composition edge. Values arriving
 * here were contrast-validated at BrandKit save time.
 */

export interface BrandTheme {
  surface?: string
  surfaceRaised?: string
  surfaceSunken?: string
  text?: string
  textMuted?: string
  textFaint?: string
  line?: string
  accent?: string
  accentStrong?: string
  onAccent?: string
  fontUi?: string
  fontReading?: string
  radiusSmall?: string
  radiusMedium?: string
  radiusLarge?: string
}

const BRAND_VAR: Record<keyof BrandTheme, string> = {
  surface: '--dof-brand-surface',
  surfaceRaised: '--dof-brand-surface-raised',
  surfaceSunken: '--dof-brand-surface-sunken',
  text: '--dof-brand-text',
  textMuted: '--dof-brand-text-muted',
  textFaint: '--dof-brand-text-faint',
  line: '--dof-brand-line',
  accent: '--dof-brand-accent',
  accentStrong: '--dof-brand-accent-strong',
  onAccent: '--dof-brand-on-accent',
  fontUi: '--dof-brand-font-ui',
  fontReading: '--dof-brand-font-reading',
  radiusSmall: '--dof-brand-radius-small',
  radiusMedium: '--dof-brand-radius-medium',
  radiusLarge: '--dof-brand-radius-large',
}

/** Style object for the storefront scope root. Unset keys fall back in CSS. */
export function brandKitStyle(theme: BrandTheme): Record<string, string> {
  const style: Record<string, string> = {}
  for (const key of Object.keys(BRAND_VAR) as Array<keyof BrandTheme>) {
    const value = theme[key]
    if (value !== undefined && value !== '') style[BRAND_VAR[key]] = value
  }
  return style
}

export const BRAND_VARIABLES = Object.freeze(Object.values(BRAND_VAR))
