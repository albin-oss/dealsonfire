/**
 * useConfirmation — the R2/R3 signature gate (DESIGN-SYSTEM-001 §3.2 Approve/Confirmation).
 * REFUSES R0/R1 at construction: cheaply reversible actions must use useUndoable —
 * asking first is the defect (Reversible Over Confirmed, compiled in).
 * R3 additionally requires typed confirmation text and never accepts an AI initiator.
 */
import { ref, computed, readonly } from 'vue'
import type { RClass, PatternActor } from '../../types'

export interface ConfirmationInput {
  rClass: RClass
  initiator?: PatternActor
  /** What is about to become true, in merchant language. */
  summary: string
  /** R3 only: the exact text the user must type (e.g. the store handle). */
  challenge?: string
  onConfirm: () => void | Promise<void>
}

export function useConfirmation(input: ConfirmationInput) {
  if (input.rClass === 'R0' || input.rClass === 'R1') {
    throw new Error(`useConfirmation refuses ${input.rClass}: reversible actions apply with undo (useUndoable) — confirmation is reserved for consequence (DS-5)`)
  }
  if (input.rClass === 'R3' && input.initiator === 'ai') {
    throw new Error('R3 actions cannot be AI-initiated at any autonomy setting (ADR-001 §13.3)')
  }
  if (input.rClass === 'R3' && !input.challenge) {
    throw new Error('R3 confirmation requires a typed challenge (DESIGN-SYSTEM-001 §3.2 Danger)')
  }

  const open = ref(false)
  const typed = ref('')
  const busy = ref(false)

  const satisfied = computed(() =>
    input.rClass === 'R3' ? typed.value.trim() === input.challenge : true)

  function request() {
    typed.value = ''
    open.value = true
  }

  function cancel() {
    open.value = false
    typed.value = ''
  }

  async function confirm(): Promise<void> {
    if (!open.value || !satisfied.value || busy.value) return
    busy.value = true
    try {
      await input.onConfirm()
      open.value = false
    } finally {
      busy.value = false
    }
  }

  return { open: readonly(open), typed, busy: readonly(busy), satisfied, summary: input.summary, rClass: input.rClass, request, cancel, confirm }
}
