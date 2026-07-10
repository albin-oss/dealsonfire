/** Token contract: generated TS in sync with CSS; tempo values match the Bible bands. */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { SYS_TOKENS, REF_TOKENS, BRAND_TOKENS, DURATIONS_MS, cssVar } from '@ds/tokens/tokens.generated'
import { BRAND_VARIABLES } from '@ds/tokens/brand-kit'

describe('token architecture (DS-4)', () => {
  it('tokens.generated.ts is in sync with tokens/*.css', () => {
    execFileSync('node', ['scripts/generate-tokens.mjs', '--check'], { stdio: 'pipe' })
  })

  it('every sys role components rely on exists', () => {
    for (const role of [
      '--dof-sys-color-surface', '--dof-sys-color-text', '--dof-sys-color-accent',
      '--dof-sys-color-ember', '--dof-sys-color-focus', '--dof-sys-radius-medium', '--dof-sys-font-ui',
    ]) {
      expect(SYS_TOKENS).toContain(role)
    }
    expect(REF_TOKENS.length).toBeGreaterThan(40)
  })

  it('tempo bands are exactly the Bible §6.2 durations', () => {
    expect(DURATIONS_MS).toEqual({ instant: 100, quick: 200, deliberate: 400, celebration: 1100 })
  })

  it('brand-kit.ts variables all exist in the storefront scope CSS', () => {
    for (const variable of BRAND_VARIABLES) {
      expect(BRAND_TOKENS).toContain(variable)
    }
  })

  it('cssVar emits token-pure references', () => {
    expect(cssVar('--dof-sys-color-accent')).toBe('var(--dof-sys-color-accent)')
  })
})
