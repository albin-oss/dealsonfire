/**
 * useJourney — the wizard/ceremony step machine (DESIGN-SYSTEM-001 §3.2 Wizard).
 * Wizards are permitted only for ceremonies (genesis, guided imports); every step is
 * resumable (the persistence adapter is supplied by the app — server drafts, storage),
 * back never loses work, and progress is the thing materializing, never a % bar.
 */
import { ref, computed, readonly, type Ref } from 'vue'

export interface JourneyStep<TState> {
  id: string
  /** May the journey advance past this step? Return an educating message to block. */
  validate?: (state: TState) => true | string
}

export interface JourneyPersistence<TState> {
  load: () => Promise<{ stepId: string; state: TState } | null>
  save: (snapshot: { stepId: string; state: TState }) => Promise<void>
}

export function useJourney<TState>(input: {
  steps: Array<JourneyStep<TState>>
  initialState: TState
  persistence?: JourneyPersistence<TState>
}) {
  if (input.steps.length === 0) throw new Error('a journey needs at least one step')

  const index = ref(0)
  const state = ref(input.initialState) as Ref<TState>
  const blockedReason = ref<string | null>(null)
  const restoring = ref(false)

  const current = computed(() => input.steps[index.value]!)
  const isFirst = computed(() => index.value === 0)
  const isLast = computed(() => index.value === input.steps.length - 1)

  async function persist() {
    if (!input.persistence) return
    // adapters receive a plain snapshot, never the live reactive proxy — journey state
    // is draft data and JSON-serializable by contract (it persists to server drafts)
    const snapshot = JSON.parse(JSON.stringify(state.value)) as TState
    await input.persistence.save({ stepId: current.value.id, state: snapshot })
  }

  /** Resume from persisted state (call once on mount when re-entering). */
  async function resume(): Promise<boolean> {
    if (!input.persistence) return false
    restoring.value = true
    try {
      const snapshot = await input.persistence.load()
      if (!snapshot) return false
      const at = input.steps.findIndex((s) => s.id === snapshot.stepId)
      if (at === -1) return false
      state.value = snapshot.state
      index.value = at
      return true
    } finally {
      restoring.value = false
    }
  }

  async function next(): Promise<boolean> {
    blockedReason.value = null
    const verdict = current.value.validate?.(state.value) ?? true
    if (verdict !== true) {
      blockedReason.value = verdict // an educating message, never a bare "invalid"
      return false
    }
    if (!isLast.value) index.value += 1
    await persist()
    return true
  }

  /** Back is safe, always: state is kept, nothing re-asked. */
  async function back(): Promise<void> {
    blockedReason.value = null
    if (!isFirst.value) index.value -= 1
    await persist()
  }

  return {
    state,
    current,
    stepIndex: readonly(index),
    stepCount: input.steps.length,
    isFirst,
    isLast,
    blockedReason: readonly(blockedReason),
    restoring: readonly(restoring),
    resume,
    next,
    back,
    persist,
  }
}
