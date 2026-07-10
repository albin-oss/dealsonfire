/**
 * Identity integration point (DECISIONS D-04). The Identity domain owns authentication;
 * the Merchant Kernel consumes a resolved session through this port and never implements auth.
 *  - 'dev' adapter: x-dof-user-id header (+ x-dof-step-up: true). REFUSES to run in production.
 *  - 'session' adapter: the Identity-domain session cookie — fails closed (null) until it lands.
 */
import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { isUuid } from '@domains/merchant/shared-kernel/uuid'
import { getServerConfig } from './config'

export interface AuthContext {
  userId: string
  /** Fresh step-up assertion (≤5 min MFA) — required by sensitive commands (BLUEPRINT §9). */
  stepUpVerified: boolean
}

export function resolveAuth(event: H3Event): AuthContext | null {
  const config = getServerConfig()

  if (config.identityMode === 'dev') {
    if (config.isProduction) {
      // Fail closed: the dev adapter must never authenticate anyone in production.
      console.error('[identity] NUXT_IDENTITY_MODE=dev is forbidden in production — refusing all auth')
      return null
    }
    const userId = getHeader(event, 'x-dof-user-id')
    if (!userId || !isUuid(userId)) return null
    return { userId, stepUpVerified: getHeader(event, 'x-dof-step-up') === 'true' }
  }

  // 'session': Identity domain not yet integrated — fail closed.
  return null
}
