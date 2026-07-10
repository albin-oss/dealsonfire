/** POST /api/v1/auth/webauthn/authentication-options (WP-R1-B1 US-2). Public (passkey login). */
import { defineEventHandler } from 'h3'
import { getContainer } from '../../../../utils/container'
export default defineEventHandler(async () => getContainer().identity.webauthn.authenticationOptions())
