/**
 * useShortcuts — the global keyboard registry (DESIGN-SYSTEM-001 §4). One registry
 * feeds the palette, context menus, and the printable cheat sheet; registration
 * CONFLICT-CHECKS at call time (two owners of one chord is a defect, caught in dev
 * and test, not in a user's hands). Editable targets are respected.
 */
import { onScopeDispose } from 'vue'

export interface Shortcut {
  /** Chord: 'mod+k', 'shift+/', 'escape'. 'mod' = ⌘ on mac, Ctrl elsewhere. */
  combo: string
  description: string
  handler: (event: KeyboardEvent) => void
  /** Fire even when focus is in an input (rare — e.g. 'escape'). */
  allowInEditable?: boolean
}

const registry = new Map<string, Shortcut>()
let listening = false

function normalize(combo: string): string {
  return combo.toLowerCase().split('+').map((p) => p.trim()).sort().join('+')
}

function comboOf(event: KeyboardEvent): string {
  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) parts.push('mod')
  if (event.altKey) parts.push('alt')
  if (event.shiftKey) parts.push('shift')
  parts.push(event.key.toLowerCase())
  return parts.sort().join('+')
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function onKeydown(event: KeyboardEvent) {
  const shortcut = registry.get(comboOf(event))
  if (!shortcut) return
  if (isEditable(event.target) && !shortcut.allowInEditable) return
  event.preventDefault()
  shortcut.handler(event)
}

function ensureListener() {
  if (listening || typeof window === 'undefined') return
  window.addEventListener('keydown', onKeydown)
  listening = true
}

export function useShortcuts(shortcuts: Shortcut[]) {
  // SSR-inert: keyboard chords are a client concept, and module-scope registries
  // persist across server requests — registering during SSR would conflict on the
  // second render of any page (real 500, found by the app E2E suite).
  if (typeof window === 'undefined') {
    return { release: () => {} }
  }
  const keys: string[] = []
  for (const shortcut of shortcuts) {
    const key = normalize(shortcut.combo)
    const existing = registry.get(key)
    if (existing) {
      throw new Error(`shortcut conflict: "${shortcut.combo}" is already registered ("${existing.description}")`)
    }
    registry.set(key, shortcut)
    keys.push(key)
  }
  ensureListener()

  const release = () => { for (const key of keys) registry.delete(key) }
  onScopeDispose(release)
  return { release }
}

/** The cheat-sheet source: every live shortcut with its description. */
export function listShortcuts(): Array<{ combo: string; description: string }> {
  return [...registry.entries()].map(([combo, s]) => ({ combo, description: s.description }))
}
