/**
 * Identity ports (WP-R1-B1). Crypto and persistence are infrastructure (like pg —
 * boundary-forbidden in domain/); the domain depends on these interfaces, the
 * composition root binds the argon2id/sha-256/WebAuthn implementations.
 */
import type { Result } from '../../../shared/result'
import type { DomainError } from '../../../shared/errors'
import type { Tx, UnitOfWork, EventStore, AuditLog } from '../../../platform/types'
import type { UserId } from '../shared-kernel/ids'
import type { User } from './user'
import type { Clock } from './clock'
import type { GuestScope, ClaimOutcome } from './guest'

export type { Clock } from './clock'

export interface PasswordHasher {
  hash(plaintext: string): Promise<string>
  verify(plaintext: string, encoded: string): Promise<boolean>
}

/** Opaque-token hashing (sessions, recovery, guest) — sha-256, constant-time compare. */
export interface TokenHasher {
  hash(token: string): string
  /** Generate a fresh high-entropy opaque token (≥256-bit). */
  generate(): string
}

export interface EmailPort {
  send(message: { to: string; template: 'verify' | 'reset'; vars: Record<string, string> }): Promise<void>
}

export interface UserRow {
  id: string
  email: string
  emailVerified: boolean
  displayName: string | null
  status: 'active' | 'deactivated'
  sequence: number
}

export interface UserRepository {
  insert(tx: Tx, user: User, passwordHash: string | null): Promise<void>
  findById(tx: Tx, id: UserId, opts?: { forUpdate?: boolean }): Promise<User | null>
  findActiveByEmail(tx: Tx, email: string): Promise<User | null>
  update(tx: Tx, user: User): Promise<void>
  getPasswordHash(tx: Tx, id: UserId): Promise<string | null>
  setPasswordHash(tx: Tx, id: UserId, hash: string): Promise<void>
}

/** Session persistence (P2 §2 SessionRepository). The domain Session model owns the
 *  rules; this port owns storage of what the model decides. */
export interface SessionRepository {
  create(tx: Tx, s: { id: string; userId: string; tokenHash: string; stepUp: boolean; rollingExpiresAt: Date; absoluteExpiresAt: Date; userAgent: string | null }): Promise<void>
  findActiveByTokenHash(tx: Tx, tokenHash: string): Promise<SessionRow | null>
  touch(tx: Tx, id: string, rollingExpiresAt: Date): Promise<void>
  markStepUp(tx: Tx, id: string): Promise<void>
  revoke(tx: Tx, id: string): Promise<void>
  revokeAllForUser(tx: Tx, userId: string, keepId: string | null): Promise<number>
}
export interface SessionRow {
  id: string
  userId: string
  stepUpAt: Date | null
  createdAt: Date
  rollingExpiresAt: Date
  absoluteExpiresAt: Date
  revokedAt: Date | null
}

export interface RecoveryTokenRepository {
  create(tx: Tx, r: { id: string; userId: string; tokenHash: string; purpose: 'password_reset' | 'email_verify'; expiresAt: Date }): Promise<void>
  consume(tx: Tx, tokenHash: string, purpose: 'password_reset' | 'email_verify'): Promise<string | null>
  invalidateOutstanding(tx: Tx, userId: string, purpose: 'password_reset' | 'email_verify'): Promise<void>
}

export interface GuestTokenRepository {
  create(tx: Tx, g: { id: string; tokenHash: string; scopeType: string; scopeRef: string; expiresAt: Date }): Promise<void>
  resolve(tx: Tx, tokenHash: string): Promise<GuestScope | null>
}

export interface ClaimRepository {
  claim(tx: Tx, c: { id: string; userId: string; claimType: string; claimRef: string }): Promise<ClaimOutcome>
}

/** WebAuthn ceremonies (P2 §2 WebAuthnPort) — implemented over @simplewebauthn at P3. */
export interface WebAuthnPort {
  registrationOptions(userId: string, email: string, existing: string[]): Promise<{ challengeId: string; options: unknown }>
  verifyRegistration(challengeId: string, response: unknown): Promise<{ userId: string; credentialId: string; publicKey: Uint8Array; counter: number; transports: string[] } | null>
  authenticationOptions(): Promise<{ challengeId: string; options: unknown }>
  verifyAuthentication(challengeId: string, response: unknown, passkey: { credentialId: string; publicKey: Buffer; counter: number; transports: string[] }): Promise<{ newCounter: number } | null>
}

export interface IdentityDeps {
  uow: UnitOfWork
  users: UserRepository
  passwords: PasswordHasher
  tokens: TokenHasher
  clock: Clock
  eventStore: EventStore
  audit: AuditLog
}

export type IdentityResult<T> = Result<T, DomainError>
