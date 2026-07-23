/**
 * Armed destructive actions (Increment 04) — first tap asks, second acts, 3s disarms.
 * Consolidates the pattern Increment 03 introduced twice. The caller renders the
 * armed state (label/tone); this owns the arming clock and the SR announcement.
 */
import { ref } from 'vue'
import { announce } from '@ds/index'

export function useArmedAction(prompt: string) {
  const armedId = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  /** Returns true when the action should actually run (second tap). */
  function arm(id: string): boolean {
    if (armedId.value === id) {
      armedId.value = null
      if (timer) clearTimeout(timer)
      return true
    }
    armedId.value = id
    announce(prompt)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (armedId.value = null), 3000)
    return false
  }
  return { armedId, arm }
}
