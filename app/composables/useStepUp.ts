/**
 * useStepUp (WP-R1-B1 US-5): re-authenticate on the current session before a sensitive
 * action, without losing the pending action. The caller runs `withStepUp(fn)`; if the
 * server answers STEP_UP_REQUIRED, the challenge is shown, and on success the action
 * retries. Confirms fresh (≤5 min) — the challenge component binds `submit`.
 */
import { ref } from 'vue'

export function useStepUp() {
  const open = ref(false)
  const busy = ref(false)
  const error = ref('')
  let pending: (() => Promise<void>) | null = null

  /** Wrap a sensitive call; on STEP_UP_REQUIRED, prompt then retry once. */
  async function withStepUp(action: () => Promise<void>): Promise<void> {
    try {
      await action()
    } catch (e) {
      const code = (e as { data?: { code?: string } }).data?.code
      if (code === 'STEP_UP_REQUIRED') {
        pending = action
        error.value = ''
        open.value = true
        return
      }
      throw e
    }
  }

  async function submit(password: string): Promise<void> {
    busy.value = true
    error.value = ''
    try {
      await $fetch('/api/v1/auth/step-up', { method: 'POST', body: { password } })
      open.value = false
      const action = pending
      pending = null
      if (action) await action()
    } catch (e) {
      error.value = (e as { data?: { detail?: string } }).data?.detail ?? 'That password is incorrect.'
    } finally {
      busy.value = false
    }
  }

  function cancel() {
    open.value = false
    pending = null
  }

  return { open, busy, error, withStepUp, submit, cancel }
}
