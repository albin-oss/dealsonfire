/**
 * Session middleware (BLUEPRINT §1): resolves the Identity session into event.context.auth
 * for downstream handlers. Resolution itself lives in server/utils/identity.ts so handlers
 * remain mountable without Nitro middleware in tests.
 */
import { defineEventHandler } from 'h3'
import { resolveAuth } from '../utils/identity'

export default defineEventHandler((event) => {
  if (event.path?.startsWith('/api/')) {
    event.context.auth = resolveAuth(event)
  }
})
