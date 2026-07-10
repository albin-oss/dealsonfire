/**
 * useInlineEdit — editing happens where looking happens (DESIGN-SYSTEM-001 §3.2 Edit;
 * UX-BIBLE §10). Esc reverts, commit saves only on real change (silent no-op when
 * nothing changed — the D-29 discipline at the UI layer). Save failures keep the
 * draft and reopen: work is never lost to an error.
 */
import { ref, computed, readonly } from 'vue'

export interface InlineEditOptions<T> {
  /** Current committed value (a getter keeps it live). */
  value: () => T
  /** Persist the change; throw to signal failure (draft is kept). */
  save: (next: T) => void | Promise<void>
  equals?: (a: T, b: T) => boolean
}

export function useInlineEdit<T>(options: InlineEditOptions<T>) {
  const editing = ref(false)
  const saving = ref(false)
  const draft = ref<T>(options.value()) as { value: T }
  const equals = options.equals ?? ((a: T, b: T) => a === b)

  function begin() {
    draft.value = options.value()
    editing.value = true
  }

  function cancel() {
    draft.value = options.value()
    editing.value = false
  }

  async function commit(): Promise<void> {
    if (!editing.value || saving.value) return
    if (equals(draft.value, options.value())) { // no detected change → silent no-op
      editing.value = false
      return
    }
    saving.value = true
    try {
      await options.save(draft.value)
      editing.value = false
    } finally {
      saving.value = false
    }
  }

  return {
    editing: readonly(editing),
    saving: readonly(saving),
    draft,
    dirty: computed(() => editing.value && !equals(draft.value, options.value())),
    begin,
    cancel,
    commit,
    /** Spread onto the edit control: Esc reverts, Enter commits. */
    keyHandlers: {
      onKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') { event.stopPropagation(); cancel() }
        else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void commit() }
      },
    },
  }
}
