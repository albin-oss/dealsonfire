/**
 * Motion module (DESIGN-SYSTEM-001 §7). Durations are parsed from the CSS ref tokens
 * (DS-4: CSS is the source of truth); TypeScript motion logic can therefore never
 * drift from what stylesheets animate. Reduced-motion parity is central: consumers
 * ask this module for durations and automatically get 0 when the user opted out.
 */
import { computed, type ComputedRef } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { DURATIONS_MS } from '../tokens/tokens.generated'
import type { Tempo } from '../types'

export { DURATIONS_MS }

/** Reactive `prefers-reduced-motion` (SSR-safe: defaults to no preference). */
export function useReducedMotion(): ComputedRef<boolean> {
  const query = useMediaQuery('(prefers-reduced-motion: reduce)')
  return computed(() => query.value)
}

/**
 * Duration for a tempo band, honoring reduced motion (full parity, §7).
 * Use for JS-driven timing (undo windows are NOT motion — use their own ms).
 */
export function useTempo(tempo: Tempo): ComputedRef<number> {
  const reduced = useReducedMotion()
  return computed(() => (reduced.value ? 0 : DURATIONS_MS[tempo]))
}

/** Vue <Transition> prop presets — the only sanctioned enter/leave recipes. */
export const TRANSITIONS = {
  fade: {
    enterActiveClass: 'transition-opacity tempo-quick ease-enter',
    leaveActiveClass: 'transition-opacity tempo-quick ease-exit',
    enterFromClass: 'opacity-0',
    leaveToClass: 'opacity-0',
  },
  rise: {
    enterActiveClass: 'transition-[opacity,transform] tempo-quick ease-enter',
    leaveActiveClass: 'transition-[opacity,transform] tempo-quick ease-exit',
    enterFromClass: 'opacity-0 translate-y-2',
    leaveToClass: 'opacity-0 translate-y-2',
  },
  settle: {
    enterActiveClass: 'transition-[opacity,transform] tempo-deliberate ease-settle',
    leaveActiveClass: 'transition-opacity tempo-quick ease-exit',
    enterFromClass: 'opacity-0 scale-98',
    leaveToClass: 'opacity-0',
  },
} as const
export type TransitionPreset = keyof typeof TRANSITIONS
