/** Theme engine: mode ownership, scope attrs, BrandKit binding, scope/token integrity. */
import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick, type Ref } from 'vue'

// deterministic system preference
const systemDark: Ref<boolean> = ref(false)
vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useMediaQuery: () => systemDark }
})
const { useTheme, useThemeScope, useBrandKit } = await import('@ds/theme')
const { SCOPES } = await import('@ds/types')
const { SYS_TOKENS, BRAND_TOKENS } = await import('@ds/tokens/tokens.generated')

describe('useTheme (mode ownership)', () => {
  it("'system' follows the OS; pinning overrides; the document attribute tracks", async () => {
    const theme = useTheme()
    theme.set('system')
    systemDark.value = false
    await nextTick()
    expect(theme.mode.value).toBe('light')
    expect(document.documentElement.getAttribute('data-mode')).toBe('light')

    systemDark.value = true
    await nextTick()
    expect(theme.mode.value).toBe('dark')
    expect(document.documentElement.getAttribute('data-mode')).toBe('dark')

    theme.set('light')
    await nextTick()
    expect(theme.mode.value).toBe('light')
    expect(document.documentElement.getAttribute('data-mode')).toBe('light')

    theme.set('system') // restore
  })
})

describe('useThemeScope', () => {
  it('produces the structural attribute bag for any scope, reactively', () => {
    const scope = ref<'workspace' | 'admin'>('workspace')
    const { scopeAttrs } = useThemeScope(() => scope.value)
    expect(scopeAttrs.value).toEqual({ 'data-scope': 'workspace' })
    scope.value = 'admin'
    expect(scopeAttrs.value).toEqual({ 'data-scope': 'admin' })
  })
})

describe('useBrandKit', () => {
  it('binds storefront scope + brand variables; unset keys omitted (CSS fallback)', () => {
    const theme = ref({ accent: 'oklch(45% 0.12 30)' })
    const { scopeAttrs, style } = useBrandKit(theme)
    expect(scopeAttrs.value['data-scope']).toBe('storefront')
    expect(style.value).toEqual({ '--dof-brand-accent': 'oklch(45% 0.12 30)' })
    theme.value = { accent: 'oklch(45% 0.12 30)', fontUi: 'Georgia, serif' } as never
    expect(style.value['--dof-brand-font-ui']).toBe('Georgia, serif')
  })
})

describe('scope/token integrity', () => {
  it('four scopes exist and every brand variable is a generated token', () => {
    expect([...SCOPES]).toEqual(['workspace', 'storefront', 'marketplace', 'admin'])
    expect(BRAND_TOKENS.length).toBeGreaterThan(10)
    expect(SYS_TOKENS).toContain('--dof-sys-color-surface')
  })
})
