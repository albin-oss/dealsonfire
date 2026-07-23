/**
 * Recently viewed (Capability 02) — client-side continuity: the last shops and
 * products a visitor opened, kept on this device only (no server, no tracking).
 */
import { ref } from 'vue'

export interface ViewedItem { kind: 'shop' | 'product'; to: string; title: string; context: string }
const KEY = 'dof.recently-viewed'
const MAX = 8

export function useRecentlyViewed() {
  const items = ref<ViewedItem[]>([])
  function load() {
    if (typeof window === 'undefined') return
    try { items.value = JSON.parse(window.localStorage.getItem(KEY) ?? '[]') } catch { items.value = [] }
  }
  function record(item: ViewedItem) {
    if (typeof window === 'undefined') return
    load()
    items.value = [item, ...items.value.filter((i) => i.to !== item.to)].slice(0, MAX)
    window.localStorage.setItem(KEY, JSON.stringify(items.value))
  }
  load()
  return { items, record, load }
}
