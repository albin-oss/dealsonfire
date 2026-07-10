/**
 * useLoadingStage — honesty about time, compiled (UX-BIBLE §6.3; DESIGN-SYSTEM-001
 * §3.2 Loading): ≤400ms show nothing → skeleton (structure-true) → >3s narrated work.
 * The thresholds are attention-budget law, not motion tokens.
 */
import { ref, readonly, onScopeDispose, type Ref } from 'vue'

export type LoadingStage = 'idle' | 'quiet' | 'skeleton' | 'narrated'

export const QUIET_MS = 400
export const SKELETON_MS = 3000

export function useLoadingStage(options: { quietMs?: number; skeletonMs?: number } = {}) {
  const quietMs = options.quietMs ?? QUIET_MS
  const skeletonMs = options.skeletonMs ?? SKELETON_MS

  const stage: Ref<LoadingStage> = ref('idle')
  const narration = ref('')
  let timers: Array<ReturnType<typeof setTimeout>> = []

  function clear() {
    for (const t of timers) clearTimeout(t)
    timers = []
  }

  /** Call when the wait begins. */
  function start() {
    clear()
    stage.value = 'quiet'
    timers.push(setTimeout(() => { if (stage.value === 'quiet') stage.value = 'skeleton' }, quietMs))
    timers.push(setTimeout(() => { if (stage.value === 'skeleton') stage.value = 'narrated' }, skeletonMs))
  }

  /** Narrate long work in merchant language ("Reading your Etsy shop… 34 found"). */
  function narrate(message: string) {
    narration.value = message
  }

  /** Call when the wait ends (success or failure — the result renders its own state). */
  function finish() {
    clear()
    stage.value = 'idle'
    narration.value = ''
  }

  /** Wrap a promise with the full staging lifecycle. */
  async function track<T>(work: Promise<T>): Promise<T> {
    start()
    try { return await work } finally { finish() }
  }

  onScopeDispose(clear)

  return { stage: readonly(stage), narration: readonly(narration), start, narrate, finish, track }
}
