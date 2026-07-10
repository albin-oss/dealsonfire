/**
 * PasskeyService (WP-R1-B1 US-2; P4). Owns passkey registration + authentication
 * ORCHESTRATION — previously smeared across the HTTP endpoints in three separate
 * transactions with no audit (an ENGINEERING-STANDARDS §2 violation and a replay-counter
 * correctness bug). Here: verify + counter advance + audit are ONE transaction; the
 * WebAuthn ceremony is the port's (infrastructure) job. Session issuance follows the
 * command (the same pattern as register/login), not nested inside it.
 */
import { type Result, ok, err } from '../../../shared/result'
import { domainError, type DomainError } from '../../../shared/errors'
import { uuidv7 } from '../../../platform/uuid'
import type { UnitOfWork, AuditLog } from '../../../platform/types'
import type { WebAuthnPort } from '../domain/ports'
import type { PgPasskeyStore } from '../infrastructure/token-stores'
import type { SessionService } from './session-service'

export class PasskeyService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly webauthn: WebAuthnPort,
    private readonly passkeys: PgPasskeyStore,
    private readonly sessions: SessionService,
    private readonly audit: AuditLog,
  ) {}

  /** Begin registration: options for an authenticated user (existing creds excluded). */
  async beginRegistration(userId: string, email: string, existingCredentialIds: string[]) {
    return this.webauthn.registrationOptions(userId, email, existingCredentialIds)
  }

  /** Complete registration: verify the attestation, persist the passkey, audit — one tx. */
  async completeRegistration(
    input: { userId: string; challengeId: string; response: unknown; label: string | null },
  ): Promise<Result<{ credentialId: string }, DomainError>> {
    const verified = await this.webauthn.verifyRegistration(input.challengeId, input.response)
    if (!verified || verified.userId !== input.userId) {
      return err(domainError('INVALID_TOKEN', 'passkey registration could not be verified'))
    }
    return this.uow.withTransaction(async (tx) => {
      await this.passkeys.create(tx, {
        id: uuidv7(), userId: verified.userId, credentialId: verified.credentialId,
        publicKey: Buffer.from(verified.publicKey), counter: verified.counter,
        transports: verified.transports, label: input.label,
      })
      await this.audit.record(tx, {
        businessId: null, actor: { type: 'user', id: verified.userId }, command: 'identity.passkey.register',
        sensitivity: 'sensitive', target: { type: 'passkey', id: verified.credentialId },
        afterDigest: { label: input.label },
      })
      return ok({ credentialId: verified.credentialId })
    })
  }

  /** Begin authentication: a challenge for passkey login (public). */
  async beginAuthentication() {
    return this.webauthn.authenticationOptions()
  }

  /**
   * Complete authentication: find → verify → advance the replay counter → audit, ALL in
   * one transaction (the correctness fix); then issue a step-up session. Any miss answers
   * the same INVALID_CREDENTIALS (no oracle about which passkey exists).
   */
  async authenticate(
    input: { challengeId: string; response: unknown; userAgent: string | null },
  ): Promise<Result<{ userId: string; token: string }, DomainError>> {
    const credentialId = (input.response as { id?: string }).id
    if (!credentialId) return err(domainError('INVALID_CREDENTIALS', 'passkey not recognized'))

    const userId = await this.uow.withTransaction(async (tx) => {
      const passkey = await this.passkeys.findByCredentialId(tx, credentialId)
      if (!passkey) return null
      const verified = await this.webauthn.verifyAuthentication(input.challengeId, input.response, passkey)
      if (!verified) return null
      await this.passkeys.updateCounter(tx, passkey.credentialId, verified.newCounter)
      await this.audit.record(tx, {
        businessId: null, actor: { type: 'user', id: passkey.userId }, command: 'identity.passkey.authenticate',
        sensitivity: 'normal', target: { type: 'passkey', id: passkey.credentialId },
      })
      return passkey.userId
    })
    if (!userId) return err(domainError('INVALID_CREDENTIALS', 'passkey could not be verified'))

    const token = await this.sessions.issue(userId, { stepUp: true, userAgent: input.userAgent })
    return ok({ userId, token })
  }
}
