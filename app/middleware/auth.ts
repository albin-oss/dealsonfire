/**
 * Route guard (WP-R1-B1 US-9): workspace routes require a session — but only when the
 * server is in session mode. Dev mode leaves the browser open (auth is header-injected
 * server-side for local/tests), so the guard is a no-op there.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (useRuntimeConfig().public.identityMode !== 'session') return
  const { isAuthenticated, loaded, refresh } = useSession()
  if (!loaded.value) await refresh()
  if (!isAuthenticated.value) {
    // the platform's front door: an anonymous visitor at the root belongs on the
    // living Home, not a login wall — merchants deep-linking elsewhere still get login
    if (to.path === '/') return navigateTo('/home')
    return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`)
  }
})
