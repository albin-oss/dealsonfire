/**
 * useSearch — instant local narrowing + debounced server query (DESIGN-SYSTEM-001
 * §3.2 Search). Router-agnostic: URL persistence is the app's job via the serialize
 * hooks. Local matching is diacritics- and case-insensitive with literal wildcards
 * (the D-31 lesson: user text is never a pattern).
 */
import { ref, computed, watch, readonly } from 'vue'
import { refDebounced } from '@vueuse/core'

const DEFAULT_DEBOUNCE_MS = 250

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export function useSearch(options: {
  debounceMs?: number
  /** Server-side search hook — fired with the settled query (may be empty = cleared). */
  onQuery?: (query: string) => void | Promise<void>
  initial?: string
} = {}) {
  const query = ref(options.initial ?? '')
  const settled = refDebounced(query, options.debounceMs ?? DEFAULT_DEBOUNCE_MS)

  if (options.onQuery) {
    watch(settled, (value) => { void options.onQuery?.(value.trim()) })
  }

  const folded = computed(() => fold(query.value.trim()))

  /** Instant local filter: does the text contain the query (accent/case-insensitive)? */
  function matches(text: string): boolean {
    if (folded.value === '') return true
    return fold(text).includes(folded.value)
  }

  function clear() {
    query.value = ''
  }

  return {
    query,
    settled: readonly(settled),
    active: computed(() => query.value.trim() !== ''),
    matches,
    clear,
  }
}
