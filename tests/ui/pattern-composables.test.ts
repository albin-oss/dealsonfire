/** useInlineEdit, useLoadingStage, useJourney, useBulkSelection, useSearch, useQueuedAction. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, type Ref } from 'vue'
import { useInlineEdit } from '@ds/patterns/composables/use-inline-edit'
import { useLoadingStage, QUIET_MS, SKELETON_MS } from '@ds/patterns/composables/use-loading-stage'
import { useJourney, type JourneyPersistence } from '@ds/patterns/composables/use-journey'
import { useBulkSelection } from '@ds/patterns/composables/use-bulk-selection'
import { useSearch } from '@ds/patterns/composables/use-search'

// useOnline is mocked so the offline queue is deterministic
const onlineRef: Ref<boolean> = ref(true)
vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useOnline: () => onlineRef }
})
const { useQueuedAction } = await import('@ds/patterns/composables/use-queued-action')

describe('useInlineEdit', () => {
  it('Esc reverts; commit saves; unchanged commit is a silent no-op (D-29 spirit)', async () => {
    let value = 'Lavender Soap'
    const save = vi.fn(async (next: string) => { value = next })
    const edit = useInlineEdit({ value: () => value, save })

    edit.begin()
    edit.draft.value = 'Rose Soap'
    edit.keyHandlers.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(edit.editing.value).toBe(false)
    expect(value).toBe('Lavender Soap')

    edit.begin()
    await edit.commit() // unchanged
    expect(save).not.toHaveBeenCalled()

    edit.begin()
    edit.draft.value = 'Rose Soap'
    await edit.commit()
    expect(value).toBe('Rose Soap')
  })

  it('a failed save keeps the draft and stays editing (work is never lost)', async () => {
    const edit = useInlineEdit({ value: () => 'a', save: () => { throw new Error('nope') } })
    edit.begin()
    edit.draft.value = 'b'
    await expect(edit.commit()).rejects.toThrow('nope')
    expect(edit.editing.value).toBe(true)
    expect(edit.draft.value).toBe('b')
  })
})

describe('useLoadingStage (honesty about time)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('quiet → skeleton → narrated on the constitutional thresholds', () => {
    const loading = useLoadingStage()
    loading.start()
    expect(loading.stage.value).toBe('quiet')
    vi.advanceTimersByTime(QUIET_MS + 1)
    expect(loading.stage.value).toBe('skeleton')
    vi.advanceTimersByTime(SKELETON_MS - QUIET_MS)
    expect(loading.stage.value).toBe('narrated')
    loading.narrate('Reading your Etsy shop…')
    expect(loading.narration.value).toContain('Etsy')
    loading.finish()
    expect(loading.stage.value).toBe('idle')
  })

  it('fast work never shows anything', async () => {
    const loading = useLoadingStage()
    const work = loading.track(Promise.resolve(42))
    expect(loading.stage.value).toBe('quiet') // sub-threshold renders nothing
    await expect(work).resolves.toBe(42)
    expect(loading.stage.value).toBe('idle')
  })
})

describe('useJourney (resumable, back-safe, educating blocks)', () => {
  it('blocks with an educating message; back keeps state; resume restores position', async () => {
    let snapshot: { stepId: string; state: { idea: string } } | null = null
    const persistence: JourneyPersistence<{ idea: string }> = {
      load: async () => snapshot,
      save: async (s) => { snapshot = structuredClone(s) },
    }
    const journey = useJourney({
      steps: [
        { id: 'idea', validate: (s) => s.idea !== '' || 'Tell us one sentence — it seeds everything else.' },
        { id: 'done' },
      ],
      initialState: { idea: '' },
      persistence,
    })

    expect(await journey.next()).toBe(false)
    expect(journey.blockedReason.value).toContain('seeds everything')

    journey.state.value.idea = 'knitted blankets'
    expect(await journey.next()).toBe(true)
    expect(journey.current.value.id).toBe('done')

    await journey.back()
    expect(journey.state.value.idea).toBe('knitted blankets')

    // a fresh journey (new session) resumes from the persisted snapshot
    const fresh = useJourney({ steps: [{ id: 'idea' }, { id: 'done' }], initialState: { idea: '' }, persistence })
    expect(await fresh.resume()).toBe(true)
    expect(fresh.state.value.idea).toBe('knitted blankets')
  })
})

describe('useBulkSelection', () => {
  it('toggle/selectAll/take lifecycle', () => {
    const selection = useBulkSelection<string>()
    expect(selection.active.value).toBe(false)
    selection.toggle('a')
    selection.toggle('b')
    selection.toggle('a')
    expect([...selection.selected.value]).toEqual(['b'])
    selection.selectAll(['x', 'y', 'z'])
    expect(selection.count.value).toBe(3)
    expect(selection.take().sort()).toEqual(['x', 'y', 'z'])
    expect(selection.active.value).toBe(false)
  })
})

describe('useSearch', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('local matching folds case and diacritics; wildcards are literal', () => {
    const search = useSearch()
    search.query.value = 'cafe'
    expect(search.matches('Café au Lait Mug')).toBe(true)
    search.query.value = '%'
    expect(search.matches('Café au Lait Mug')).toBe(false)
    search.clear()
    expect(search.matches('anything')).toBe(true)
  })

  it('server hook fires debounced with the settled query', async () => {
    const seen: string[] = []
    const search = useSearch({ onQuery: (q) => { seen.push(q) }, debounceMs: 250 })
    search.query.value = 'so'
    search.query.value = 'soap'
    await vi.advanceTimersByTimeAsync(251)
    expect(seen).toEqual(['soap'])
  })
})

describe('useQueuedAction (offline is a state)', () => {
  beforeEach(() => { onlineRef.value = true })

  it('runs immediately when online; queues offline; flushes on reconnect in order', async () => {
    const ran: string[] = []
    const queued = useQueuedAction()

    expect(await queued.submit('first', async () => { ran.push('first') })).toBe('ran')

    onlineRef.value = false
    expect(await queued.submit('second', async () => { ran.push('second') })).toBe('queued')
    expect(await queued.submit('third', async () => { ran.push('third') })).toBe('queued')
    expect(queued.pending.value).toBe(2)

    onlineRef.value = true
    await vi.waitFor(() => expect(queued.pending.value).toBe(0))
    expect(ran).toEqual(['first', 'second', 'third'])
  })

  it('a failed flush keeps the action at the head and surfaces the error', async () => {
    const errors: string[] = []
    const queued = useQueuedAction({ onError: (a) => errors.push(a.label) })
    onlineRef.value = false
    let attempts = 0
    await queued.submit('flaky', async () => {
      attempts += 1
      if (attempts === 1) throw new Error('boom')
    })
    onlineRef.value = true
    await vi.waitFor(() => expect(errors).toEqual(['flaky']))
    expect(queued.pending.value).toBe(1) // still queued — nothing lost
    await queued.flush()
    expect(queued.pending.value).toBe(0)
  })
})
