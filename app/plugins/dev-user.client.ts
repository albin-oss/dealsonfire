/**
 * Dev-only convenience (SV-2, resolving the inherited SV-1 demo gap): become a seeded
 * merchant in the browser via `?dev-user=<uuid>`, persisted to the same localStorage key
 * the dev-identity header reads (`dof.dev-user-id`). It replaces the "paste a console
 * snippet" step that silently left the browser as a random anonymous user (empty workspace).
 *
 * This is NOT authentication: it only writes a client-side dev id that the dev adapter
 * trusts, and the dev adapter itself refuses to run in production (server/utils/identity.ts).
 * It is inert unless identity mode is 'dev', so it can never weaken the real session path.
 */
export default defineNuxtPlugin(() => {
  const { public: { identityMode } } = useRuntimeConfig()
  if (identityMode !== 'dev' || typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const devUser = url.searchParams.get('dev-user')
  if (!devUser || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(devUser)) return
  try {
    window.localStorage.setItem('dof.dev-user-id', devUser)
  } catch { /* private mode — the header falls back to a minted id, same as before */ }
  url.searchParams.delete('dev-user')
  window.history.replaceState({}, '', url.toString())
})
