/** useUndoable — R0/R1 optimistic apply + undo window; refuses consequence classes. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useUndoable, DEFAULT_UNDO_WINDOW_MS } from '@ds/patterns/composables/use-undoable'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useUndoable', () => {
  it('applies optimistically and commits after the window (digest hook fires)', async () => {
    const committed: string[] = []
    const undoable = useUndoable({ onCommitted: (e) => committed.push(e.label) })
    let archived = false
    await undoable.run({ label: 'Archived Soap', rClass: 'R1', apply: () => { archived = true }, undo: () => { archived = false } })

    expect(archived).toBe(true)
    expect(undoable.entries.value).toHaveLength(1)

    vi.advanceTimersByTime(DEFAULT_UNDO_WINDOW_MS + 1)
    expect(undoable.entries.value).toHaveLength(0)
    expect(committed).toEqual(['Archived Soap'])
    expect(archived).toBe(true)
  })

  it('undo reverses within the window and fires the self-demotion signal', async () => {
    const undone: string[] = []
    const undoable = useUndoable({ onUndone: (e) => undone.push(e.label) })
    let archived = false
    const id = await undoable.run({ label: 'Archived Soap', rClass: 'R0', apply: () => { archived = true }, undo: () => { archived = false } })

    expect(await undoable.undo(id)).toBe(true)
    expect(archived).toBe(false)
    expect(undone).toEqual(['Archived Soap'])
    expect(undoable.entries.value).toHaveLength(0)
  })

  it('undo after the window closed is a clean no (never a crash)', async () => {
    const undoable = useUndoable()
    const id = await undoable.run({ label: 'x', rClass: 'R0', apply: () => {}, undo: () => {} })
    vi.advanceTimersByTime(DEFAULT_UNDO_WINDOW_MS + 1)
    expect(await undoable.undo(id)).toBe(false)
  })

  it('refuses R2/R3 — Reversible Over Confirmed is compiled in (DS-5)', async () => {
    const undoable = useUndoable()
    await expect(undoable.run({ label: 'x', rClass: 'R2' as never, apply: () => {}, undo: () => {} }))
      .rejects.toThrow(/refuses R2/)
  })

  it('stacks multiple pending windows independently', async () => {
    const undoable = useUndoable()
    await undoable.run({ label: 'a', rClass: 'R0', apply: () => {}, undo: () => {}, windowMs: 1000 })
    const b = await undoable.run({ label: 'b', rClass: 'R0', apply: () => {}, undo: () => {}, windowMs: 5000 })
    vi.advanceTimersByTime(1001)
    expect(undoable.entries.value.map((e) => e.label)).toEqual(['b'])
    expect(await undoable.undo(b)).toBe(true)
  })
})
