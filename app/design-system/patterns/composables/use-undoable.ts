/**
 * useUndoable — the R0/R1 pattern contract (DESIGN-SYSTEM-001 §3.1, §3.2 Undo).
 * Optimistic apply + undo window; the composable REFUSES R2/R3 (those require the
 * proposal/signature patterns — Reversible Over Confirmed is compiled in, DS-5).
 * Telemetry hooks feed the digest (R1 reports) and Ignite self-demotion (reversals).
 */
import { ref, readonly, onScopeDispose, type Ref } from 'vue'

export interface UndoableRun {
  /** Merchant-language description: "Archived Lavender Soap". */
  label: string
  rClass: 'R0' | 'R1'
  /** Apply the action (optimistic — runs immediately). */
  apply: () => void | Promise<void>
  /** Reverse it. Must be safe within the window. */
  undo: () => void | Promise<void>
  /** Undo window; defaults to the pattern default (not a motion token — an attention budget). */
  windowMs?: number
}

export interface UndoEntry {
  id: number
  label: string
  rClass: 'R0' | 'R1'
  expiresAt: number
  state: 'pending' | 'undoing'
}

export interface UseUndoableOptions {
  defaultWindowMs?: number
  /** Fired when a window elapses uncontested — R1 consumers report to the digest here. */
  onCommitted?: (entry: UndoEntry) => void
  /** Fired on reversal — the Ignite self-demotion signal (ADR-005 §2.4). */
  onUndone?: (entry: UndoEntry) => void
}

export const DEFAULT_UNDO_WINDOW_MS = 6000

export function useUndoable(options: UseUndoableOptions = {}) {
  const entries: Ref<UndoEntry[]> = ref([])
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  const actions = new Map<number, UndoableRun>()
  let nextId = 1

  function commit(id: number) {
    const entry = entries.value.find((e) => e.id === id)
    if (!entry) return
    remove(id)
    options.onCommitted?.(entry)
  }

  function remove(id: number) {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
    actions.delete(id)
    entries.value = entries.value.filter((e) => e.id !== id)
  }

  /** Apply an action optimistically; returns the entry id. */
  async function run(action: UndoableRun): Promise<number> {
    if ((action.rClass as string) === 'R2' || (action.rClass as string) === 'R3') {
      throw new Error(`useUndoable refuses ${action.rClass}: consequential actions use the proposal/signature patterns (DS-5)`)
    }
    await action.apply()
    const windowMs = action.windowMs ?? options.defaultWindowMs ?? DEFAULT_UNDO_WINDOW_MS
    const id = nextId++
    const entry: UndoEntry = { id, label: action.label, rClass: action.rClass, expiresAt: Date.now() + windowMs, state: 'pending' }
    entries.value = [...entries.value, entry]
    actions.set(id, action)
    timers.set(id, setTimeout(() => commit(id), windowMs))
    return id
  }

  /** Reverse a pending action. Resolves false if the window already closed. */
  async function undo(id: number): Promise<boolean> {
    const entry = entries.value.find((e) => e.id === id)
    const action = actions.get(id)
    if (!entry || !action || entry.state !== 'pending') return false
    entry.state = 'undoing'
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    try {
      await action.undo()
      options.onUndone?.(entry)
      return true
    } finally {
      remove(id)
    }
  }

  onScopeDispose(() => {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  })

  return { entries: readonly(entries), run, undo }
}

export type UseUndoableReturn = ReturnType<typeof useUndoable>
