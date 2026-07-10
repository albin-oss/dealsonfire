/**
 * Command registry (DESIGN-SYSTEM-001 §4, DS-8): ONE registry feeds the ask bar,
 * context menus, and quick actions. Registration conflict-checks ids (two owners of
 * one command is a defect caught in dev/test); groups render in registration order.
 * Business features register their commands on mount and release on unmount.
 */
import { onScopeDispose, ref, readonly } from 'vue'
import type { IconName } from '../../icons/icons.generated'

export interface Command {
  /** Stable id: 'nav.products', 'product.create'. */
  id: string
  label: string
  /** Group heading in the palette: 'Go to', 'Actions'. */
  group: string
  icon?: IconName
  /** Extra match terms beyond the label. */
  keywords?: string[]
  run: () => void
}

const registry = ref<Map<string, Command>>(new Map())

export function registerCommands(commands: Command[]): { release: () => void } {
  // SSR-inert for the same reason as useShortcuts: the registry is client state;
  // on the server it would leak (and conflict) across requests.
  if (typeof window === 'undefined') {
    return { release: () => {} }
  }
  const next = new Map(registry.value)
  for (const command of commands) {
    const existing = next.get(command.id)
    if (existing) {
      throw new Error(`command conflict: "${command.id}" is already registered ("${existing.label}")`)
    }
    next.set(command.id, command)
  }
  registry.value = next

  const ids = commands.map((c) => c.id)
  const release = () => {
    const pruned = new Map(registry.value)
    for (const id of ids) pruned.delete(id)
    registry.value = pruned
  }
  try {
    onScopeDispose(release)
  } catch {
    // outside a scope (tests, app bootstrap) — caller owns release
  }
  return { release }
}

export function listCommands(): Command[] {
  return [...registry.value.values()]
}

export function useCommands() {
  return { commands: readonly(registry), listCommands, registerCommands }
}

/** Future extension seam (UI-COM-001 §4): async result providers (server search…). */
export interface SearchResult {
  id: string
  label: string
  hint?: string
  run: () => void
}
export interface SearchProvider {
  id: string
  /** Group heading for this provider's results. */
  label: string
  search: (term: string) => Promise<SearchResult[]>
}
