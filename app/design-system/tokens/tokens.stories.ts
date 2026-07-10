/**
 * Token documentation (UI-FOUNDATION-001A §8): the living reference for every token
 * category, rendered FROM the tokens (cssVar) so this page cannot drift from the CSS.
 * Use the Scope/Mode toolbars to watch the same semantic roles re-resolve — and the
 * nesting story to see scope inheritance (the Reveal's storefront-preview mechanic).
 */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h } from 'vue'
import { cssVar, SYS_TOKENS, DURATIONS_MS } from './tokens.generated'
import { brandKitStyle } from './brand-kit'
import { SCOPES } from '../types'
import DofText from '../primitives/dof-text.vue'
import DofBadge from '../primitives/dof-badge.vue'

const meta: Meta = { title: 'Foundation/Tokens' }
export default meta

const swatch = (token: (typeof SYS_TOKENS)[number]) =>
  h('div', { class: 'flex items-center gap-3' }, [
    h('span', { class: 'size-8 shrink-0 rounded-small border border-line', style: { background: cssVar(token) } }),
    h('code', { class: 'text-caption text-muted-foreground' }, token),
  ])

export const SemanticColors: StoryObj = {
  render: () => () =>
    h('div', { class: 'grid grid-cols-2 gap-2 wide:grid-cols-3' },
      SYS_TOKENS.filter((t) => t.includes('-color-')).map(swatch)),
}

export const TypeScaleAndRadius: StoryObj = {
  render: () => () =>
    h('div', { class: 'flex flex-col gap-6' }, [
      h('div', { class: 'flex flex-col gap-1' }, (['display', 'headline', 'title', 'emphasis', 'body', 'caption'] as const).map((role) =>
        h(DofText, { role }, () => `${role} — warm precision`))),
      h('div', { class: 'flex items-end gap-4' }, (['small', 'medium', 'large'] as const).map((r) =>
        h('div', { class: 'flex flex-col items-center gap-1' }, [
          h('div', { class: 'size-16 border border-line bg-surface-sunken', style: { borderRadius: cssVar(`--dof-sys-radius-${r}` as never) } }),
          h('code', { class: 'text-caption text-faint-foreground' }, r),
        ]))),
      h('div', { class: 'flex items-center gap-4' }, [
        h('div', { class: 'flex h-20 w-32 items-center justify-center rounded-medium bg-surface-raised text-caption text-muted-foreground' }, 'flat'),
        h('div', { class: 'flex h-20 w-32 items-center justify-center rounded-medium bg-surface-raised text-caption text-muted-foreground shadow-raised' }, 'raised'),
        h('div', { class: 'flex h-20 w-32 items-center justify-center rounded-medium bg-surface-raised text-caption text-muted-foreground shadow-overlay' }, 'overlay'),
        h('div', { class: 'flex h-20 w-32 items-center justify-center rounded-medium bg-surface-raised text-caption text-muted-foreground shadow-spotlight' }, 'spotlight'),
      ]),
    ]),
}

export const MotionTempo: StoryObj = {
  render: () => () =>
    h('div', { class: 'flex flex-col gap-2' }, Object.entries(DURATIONS_MS).map(([band, ms]) =>
      h('div', { class: 'flex items-center gap-3' }, [
        h(DofBadge, { tone: 'neutral' }, () => `tempo-${band}`),
        h(DofText, { role: 'caption', tone: 'muted', as: 'span' }, () => `${ms}ms — from the CSS ref tokens, generated (DS-4)`),
      ]))),
}

/** The four scopes side by side — same components, same sys roles, re-resolved. */
export const ScopeGallery: StoryObj = {
  render: () => () =>
    h('div', { class: 'grid grid-cols-2 gap-4' }, SCOPES.map((scope) =>
      h('div', {
        'data-scope': scope,
        class: 'flex flex-col gap-2 rounded-large border border-line bg-surface p-4',
        style: scope === 'storefront' ? brandKitStyle({ accent: 'oklch(45% 0.12 30)', surface: 'oklch(97% 0.02 60)' }) : undefined,
      }, [
        h(DofText, { role: 'emphasis' }, () => scope),
        h('div', { class: 'flex items-center gap-2' }, [
          h('span', { class: 'rounded-medium bg-accent px-3 py-1.5 text-caption text-on-accent' }, 'accent'),
          h('span', { class: 'rounded-medium bg-surface-sunken px-3 py-1.5 text-caption text-muted-foreground' }, 'sunken'),
        ]),
        h(DofText, { role: 'caption', tone: 'faint' }, () =>
          scope === 'storefront' ? 'BrandKit vars set inline — terracotta accent, warm surface' : 'platform resolution'),
      ]))),
}

/** Scope NESTING: a branded storefront preview inside the workspace — the Reveal mechanic. */
export const NestedScopes: StoryObj = {
  render: () => () =>
    h('div', { 'data-scope': 'workspace', class: 'flex flex-col gap-3 rounded-large bg-surface p-5' }, [
      h(DofText, { role: 'emphasis' }, () => 'Workspace (outer scope)'),
      h('div', {
        'data-scope': 'storefront',
        style: brandKitStyle({ accent: 'oklch(45% 0.12 30)', surface: 'oklch(96.5% 0.025 60)', text: 'oklch(30% 0.04 40)' }),
        class: 'flex flex-col gap-2 rounded-large border border-line bg-surface p-4',
      }, [
        h(DofText, { role: 'emphasis' }, () => "Rosa's Ceramics (nested storefront scope)"),
        h('span', { class: 'w-fit rounded-medium bg-accent px-3 py-1.5 text-caption text-on-accent' }, 'brand accent'),
        h(DofText, { role: 'caption', tone: 'muted' }, () =>
          'Inner sys tokens re-resolve from BrandKit; unset roles inherit the workspace values above — pure CSS cascade, no JS.'),
      ]),
      h(DofText, { role: 'caption', tone: 'faint' }, () => 'This is how the genesis Reveal previews a store inside the workspace.'),
    ]),
}
