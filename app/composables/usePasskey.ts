/**
 * Passkey client helpers (WP-R1-B1 US-2) via @simplewebauthn/browser. Wraps the two
 * ceremonies; the server holds the challenge between options and verify.
 */
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'

export async function registerPasskey(label?: string): Promise<void> {
  const { challengeId, options } = await $fetch<{ challengeId: string; options: Record<string, unknown> }>(
    '/api/v1/auth/webauthn/registration-options', { method: 'POST' })
  const response = await startRegistration({ optionsJSON: options as never })
  await $fetch('/api/v1/auth/webauthn/verify-registration', {
    method: 'POST', body: { challenge_id: challengeId, response, label: label ?? null },
  })
}

export async function startPasskeyLogin(): Promise<void> {
  const { challengeId, options } = await $fetch<{ challengeId: string; options: Record<string, unknown> }>(
    '/api/v1/auth/webauthn/authentication-options', { method: 'POST' })
  const response = await startAuthentication({ optionsJSON: options as never })
  await $fetch('/api/v1/auth/webauthn/authenticate', {
    method: 'POST', body: { challenge_id: challengeId, response },
  })
}
