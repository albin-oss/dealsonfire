/**
 * WebAuthn / passkeys (WP-R1-B1, US-2) via @simplewebauthn/server. Registration and
 * authentication ceremonies; password is always the fallback (AC-2.1 — never passkey-only).
 * Challenges are held in an injectable ChallengeStore (TTL) between the options and verify
 * steps; the in-memory adapter is single-instance — multi-instance persistence is recorded
 * debt (WP §8 top risk; password path unaffected).
 */
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
  type VerifiedRegistrationResponse, type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server'
import { uuidv7 } from '../../../platform/uuid'

export interface ChallengeStore {
  put(id: string, challenge: string, userId: string | null): void
  take(id: string): { challenge: string; userId: string | null } | null
}

export class MemoryChallengeStore implements ChallengeStore {
  private readonly map = new Map<string, { challenge: string; userId: string | null; expires: number }>()
  private static readonly TTL = 5 * 60 * 1000
  put(id: string, challenge: string, userId: string | null): void {
    this.map.set(id, { challenge, userId, expires: Date.now() + MemoryChallengeStore.TTL })
  }
  take(id: string): { challenge: string; userId: string | null } | null {
    const e = this.map.get(id)
    this.map.delete(id)
    if (!e || e.expires < Date.now()) return null
    return { challenge: e.challenge, userId: e.userId }
  }
}

export interface WebAuthnConfig {
  rpName: string
  rpId: string
  origin: string
}

export class WebAuthnService {
  constructor(private readonly config: WebAuthnConfig, private readonly challenges: ChallengeStore) {}

  async registrationOptions(userId: string, email: string, existing: string[]): Promise<{ challengeId: string; options: unknown }> {
    const options = await generateRegistrationOptions({
      rpName: this.config.rpName,
      rpID: this.config.rpId,
      userName: email,
      userID: new TextEncoder().encode(userId),
      attestationType: 'none',
      excludeCredentials: existing.map((id) => ({ id })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    })
    const challengeId = uuidv7()
    this.challenges.put(challengeId, options.challenge, userId)
    return { challengeId, options }
  }

  async verifyRegistration(challengeId: string, response: unknown): Promise<{ userId: string; credentialId: string; publicKey: Uint8Array; counter: number; transports: string[] } | null> {
    const pending = this.challenges.take(challengeId)
    if (!pending || !pending.userId) return null
    let verified: VerifiedRegistrationResponse
    try {
      verified = await verifyRegistrationResponse({
        response: response as never,
        expectedChallenge: pending.challenge,
        expectedOrigin: this.config.origin,
        expectedRPID: this.config.rpId,
      })
    } catch {
      return null
    }
    if (!verified.verified || !verified.registrationInfo) return null
    const cred = verified.registrationInfo.credential
    return {
      userId: pending.userId,
      credentialId: cred.id,
      publicKey: cred.publicKey,
      counter: cred.counter,
      transports: (cred.transports ?? []) as string[],
    }
  }

  async authenticationOptions(): Promise<{ challengeId: string; options: unknown }> {
    const options = await generateAuthenticationOptions({ rpID: this.config.rpId, userVerification: 'preferred' })
    const challengeId = uuidv7()
    this.challenges.put(challengeId, options.challenge, null)
    return { challengeId, options }
  }

  async verifyAuthentication(
    challengeId: string,
    response: unknown,
    passkey: { credentialId: string; publicKey: Buffer; counter: number; transports: string[] },
  ): Promise<{ newCounter: number } | null> {
    const pending = this.challenges.take(challengeId)
    if (!pending) return null
    let verified: VerifiedAuthenticationResponse
    try {
      verified = await verifyAuthenticationResponse({
        response: response as never,
        expectedChallenge: pending.challenge,
        expectedOrigin: this.config.origin,
        expectedRPID: this.config.rpId,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: passkey.counter,
          transports: passkey.transports as never,
        },
      })
    } catch {
      return null
    }
    if (!verified.verified) return null
    return { newCounter: verified.authenticationInfo.newCounter }
  }
}
