/**
 * Theme engine composables (UI-FOUNDATION-001A §5). Zero business logic — these
 * manage the two runtime axes of the token system:
 *
 *  - MODE (light/dark/system) lives on <html data-mode> — one value per document,
 *    owned by `useTheme()`. 'system' follows prefers-color-scheme reactively.
 *  - SCOPE (workspace/storefront/marketplace/admin) is STRUCTURAL, not global:
 *    a scope is wherever a `data-scope` attribute sits, scopes nest, and inner
 *    scopes inherit every sys token they don't re-declare (pure CSS cascade —
 *    a storefront preview inside the workspace Reveal is the canonical nesting).
 *    `useThemeScope()` hands components the attribute bag; `useBrandKit()` adds
 *    the merchant's BrandKit variables for storefront scopes.
 *
 * SSR-safe: document access is guarded; the server renders the default resolution
 * and the client converges on mount.
 */
import { computed, ref, toValue, watchEffect, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import type { Mode, Scope } from '../types'
import { brandKitStyle, type BrandTheme } from '../tokens/brand-kit'

export type ModePreference = Mode | 'system'

const preference: Ref<ModePreference> = ref('system')
let applying = false

/**
 * Document color mode. `set('dark' | 'light')` pins it; `set('system')` follows the
 * OS. Persistence is the app's concern (pass the stored value once at startup).
 */
export function useTheme() {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const resolved: ComputedRef<Mode> = computed(() =>
    preference.value === 'system' ? (systemDark.value ? 'dark' : 'light') : preference.value)

  if (!applying) {
    applying = true
    watchEffect(() => {
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-mode', resolved.value)
      }
    })
  }

  return {
    preference,
    mode: resolved,
    set(next: ModePreference) {
      preference.value = next
    },
  }
}

/**
 * Attribute bag for a scope root. Spread onto the element that starts the scope:
 * `<div v-bind="scopeAttrs">` — nesting works by construction (CSS cascade).
 */
export function useThemeScope(scope: MaybeRefOrGetter<Scope>) {
  const scopeRef = computed(() => toValue(scope))
  return {
    scope: scopeRef,
    scopeAttrs: computed(() => ({ 'data-scope': scopeRef.value })),
  }
}

/**
 * Storefront scope root with the merchant's BrandKit resolved to CSS variables.
 * Values were contrast-validated at BrandKit save time (DS-2); unset keys fall
 * back to the platform resolution in CSS.
 */
export function useBrandKit(theme: MaybeRefOrGetter<BrandTheme>) {
  const style = computed(() => brandKitStyle(toValue(theme)))
  return {
    style,
    scopeAttrs: computed(() => ({ 'data-scope': 'storefront' as const, style: style.value })),
  }
}
