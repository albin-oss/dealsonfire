/**
 * useSession (WP-R1-B1 US-9). The client's view of the current identity, backed by
 * GET /api/v1/auth/session. Shared state via useState so the whole app agrees.
 */
import { computed } from 'vue'

export interface SessionUser {
  user_id: string
  email: string
  display_name: string | null
  email_verified: boolean
  step_up_verified: boolean
}

export function useSession() {
  const user = useState<SessionUser | null>('dof.session', () => null)
  const loaded = useState<boolean>('dof.session.loaded', () => false)

  async function refresh(): Promise<void> {
    try {
      user.value = await $fetch<SessionUser>('/api/v1/auth/session')
    } catch {
      user.value = null
    } finally {
      loaded.value = true
    }
  }

  async function logout(): Promise<void> {
    await $fetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {})
    user.value = null
    await navigateTo('/login')
  }

  return {
    user: computed(() => user.value),
    isAuthenticated: computed(() => user.value !== null),
    loaded: computed(() => loaded.value),
    refresh,
    logout,
  }
}
