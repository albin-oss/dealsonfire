/**
 * WebAuthn / passkeys (WP-R1-B1, US-2) via @simplewebauthn/server. Registration and
 * authentication ceremonies; password is always the fallback (AC-2.1 — never passkey-only).
 * Challenges are held in an injectable ChallengeStore (TTL) between the options and verify
 * steps; the in-memory adapter is single-instance — multi-instance persistence is recorded
 * debt (WP §8 top risk; password path unaffected).
 */
import { createHash } from 'node:crypto'
import type pg from 'pg'
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
  type VerifiedRegistrationResponse, type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server'
import { uuidv7 } from '../../../platform/uuid'

/** C12-2: challenges live HASHED at rest — verification compares digests via
 *  simplewebauthn's predicate form; the plaintext challenge never persists. */
export const hashChallenge = (challenge: string): string =>
  createHash('sha256').update(challenge).digest('base64')

export interface ChallengeStore {
  /** C12-2: async — the production store is Postgres (challenges survive
   *  restarts and instances); take IS consume, atomically, exactly once.
   *  Stores receive the plaintext but persist only its hash; take returns
   *  the HASH — verification is a digest comparison, never an equality on a
   *  stored secret. */
  put(id: string, challenge: string, userId: string | null): Promise<void>
  take(id: string): Promise<{ challengeHash: string; userId: string | null } | null>
}

export class MemoryChallengeStore implements ChallengeStore {
  private readonly map = new Map<string, { challengeHash: string; userId: string | null; expires: number }>()
  private static readonly TTL = 5 * 60 * 1000
  async put(id: string, challenge: string, userId: string | null): Promise<void> {
    this.map.set(id, { challengeHash: hashChallenge(challenge), userId, expires: Date.now() + MemoryChallengeStore.TTL })
  }
  async take(id: string): Promise<{ challengeHash: string; userId: string | null } | null> {
    const e = this.map.get(id)
    this.map.delete(id)
    if (!e || e.expires < Date.now()) return null
    return { challengeHash: e.challengeHash, userId: e.userId }
  }
}

/** C12-2 durable store (retires recorded debt D-40e): ceremonies survive
 *  restarts and instances; DELETE … RETURNING makes take-is-consume atomic —
 *  a consumed, expired, or foreign ceremony finds nothing; parallel
 *  ceremonies are independent rows. Expired rows die opportunistically. */
export class PgChallengeStore implements ChallengeStore {
  private static readonly TTL_MS = 5 * 60 * 1000
  constructor(private readonly pool: pg.Pool) {}
  async put(id: string, challenge: string, userId: string | null): Promise<void> {
    await this.pool.query(
      `INSERT INTO webauthn_challenges (id, ceremony_id, challenge_hash, user_id, expires_at)
       VALUES ($1, $2, $3, $4, now() + ($5 || ' milliseconds')::interval)`,
      [uuidv7(), id, hashChallenge(challenge), userId, PgChallengeStore.TTL_MS])
    if (Math.random() < 0.05) {
      await this.pool.query(`DELETE FROM webauthn_challenges WHERE expires_at < now()`).catch(() => {})
    }
  }
  async take(id: string): Promise<{ challengeHash: string; userId: string | null } | null> {
    const { rows } = await this.pool.query<{ challenge_hash: string; user_id: string | null }>(
      `DELETE FROM webauthn_challenges WHERE ceremony_id = $1 AND expires_at > now()
       RETURNING challenge_hash, user_id`, [id])
    if (!rows[0]) return null
    return { challengeHash: rows[0].challenge_hash, userId: rows[0].user_id }
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
    await this.challenges.put(challengeId, options.challenge, userId)
    return { challengeId, options }
  }

  async verifyRegistration(challengeId: string, response: unknown): Promise<{ userId: string; credentialId: string; publicKey: Uint8Array; counter: number; transports: string[] } | null> {
    const pending = await this.challenges.take(challengeId)
    if (!pending || !pending.userId) return null
    let verified: VerifiedRegistrationResponse
    try {
      verified = await verifyRegistrationResponse({
        response: response as never,
        expectedChallenge: (received: string) => hashChallenge(received) === pending.challengeHash,
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
    await this.challenges.put(challengeId, options.challenge, null)
    return { challengeId, options }
  }

  async verifyAuthentication(
    challengeId: string,
    response: unknown,
    passkey: { credentialId: string; publicKey: Buffer; counter: number; transports: string[] },
  ): Promise<{ newCounter: number } | null> {
    const pending = await this.challenges.take(challengeId)
    if (!pending) return null
    let verified: VerifiedAuthenticationResponse
    try {
      verified = await verifyAuthenticationResponse({
        response: response as never,
        expectedChallenge: (received: string) => hashChallenge(received) === pending.challengeHash,
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
