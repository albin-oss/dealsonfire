/**
 * useBulkSelection — selection mode + batch bar state (DESIGN-SYSTEM-001 §3.2 Bulk).
 * Selection mode activates on first selection (the batch bar appears only when volume
 * makes it kind); batch actions carry the same R-class law as single actions and are
 * expected to run through useUndoable as one reversible unit.
 */
import { ref, computed, readonly } from 'vue'

export function useBulkSelection<Id extends string | number>() {
  const selected = ref<Set<Id>>(new Set()) as { value: Set<Id> }

  const count = computed(() => selected.value.size)
  const active = computed(() => count.value > 0)

  function isSelected(id: Id): boolean {
    return selected.value.has(id)
  }

  function toggle(id: Id) {
    const next = new Set(selected.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selected.value = next
  }

  function selectAll(ids: Iterable<Id>) {
    selected.value = new Set(ids)
  }

  function clear() {
    selected.value = new Set()
  }

  /** Snapshot for a batch action, clearing the selection (the run owns the ids now). */
  function take(): Id[] {
    const ids = [...selected.value]
    clear()
    return ids
  }

  return { selected: readonly(selected) as Readonly<{ value: ReadonlySet<Id> }>, count, active, isSelected, toggle, selectAll, clear, take }
}
