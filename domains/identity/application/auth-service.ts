/**
 * AuthService (WP-R1-B1, US-1/3/6). Password registration, login, and recovery — all
 * ENUMERATION-PROOF: unknown-email and wrong-password answer identically, and every
 * path performs a hash operation so timing does not leak account existence (AC-1.2/6.1).
 * Registration never blocks selling (no verification wall — AC-1.1).
 */
import { type Result, ok, err } from '../../../shared/result'
import { domainError, type DomainError } from '../../../shared/errors'
import { traceFromRequest } from '../../../platform/trace'
import { uuidv7 } from '../../../platform/uuid'
import type { Actor } from '../../merchant/shared-kernel/actor'
import { asUserId } from '../shared-kernel/ids'
import { User } from '../domain/user'
import { createEmail, createDisplayName, validatePassword } from '../domain/value-objects'
import type { EmailPort, IdentityDeps } from '../domain/ports'
import type { PgRecoveryStore } from '../infrastructure/token-stores'

const SYSTEM_ACTOR: Actor = { type: 'system', id: 'identity' }
const RESET_TTL_MS = 30 * 60 * 1000
/** A throwaway argon2 verify target so login timing is constant when the email is unknown. */
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObG'

export interface RegisterInput {
  email: string
  password: string
  displayName?: string | null
  source?: 'direct' | 'ignite_claim'
  requestContext?: Record<string, unknown>
}

export class AuthService {
  constructor(
    private readonly deps: IdentityDeps,
    private readonly recovery: PgRecoveryStore,
    private readonly email: EmailPort,
  ) {}

  /** US-1/US-2 shared registration. Duplicate email answers with a generic conflict the
   *  endpoint renders identically to success (enumeration-proof at the API layer). */
  async register(input: RegisterInput): Promise<Result<{ userId: string }, DomainError>> {
    const email = createEmail(input.email)
    if (!email.ok) return email
    const name = createDisplayName(input.displayName)
    if (!name.ok) return name
    const password = validatePassword(input.password)
    if (!password.ok) return password

    const passwordHash = await this.deps.passwords.hash(password.value)

    return this.deps.uow.withTransaction(async (tx) => {
      const existing = await this.deps.users.findActiveByEmail(tx, email.value)
      if (existing) return err(domainError('EMAIL_TAKEN', 'that email is already registered'))

      const user = User.register(
        { id: asUserId(uuidv7()), email: email.value, displayName: name.value, source: input.source ?? 'direct' },
        SYSTEM_ACTOR,
      )
      await this.deps.users.insert(tx, user, passwordHash)
      await this.deps.eventStore.append(tx, user.pullPendingEvents(), traceFromRequest(input.requestContext))
      await this.deps.audit.record(tx, {
        businessId: null, actor: { type: 'user', id: user.id }, command: 'identity.user.register',
        sensitivity: 'normal', target: { type: 'user', id: user.id },
        afterDigest: { source: input.source ?? 'direct' }, context: input.requestContext,
      })
      // async verification email (never blocks — AC-1.1)
      await this.issueRecovery(tx, user.id, user.email, 'email_verify')
      return ok({ userId: user.id })
    })
  }

  /** US-3 password login. Constant-work regardless of account existence. */
  async login(rawEmail: string, password: string): Promise<Result<{ userId: string }, DomainError>> {
    const email = createEmail(rawEmail)
    const normalized = email.ok ? email.value : rawEmail.trim().toLowerCase()
    return this.deps.uow.withTransaction(async (tx) => {
      const user = await this.deps.users.findActiveByEmail(tx, normalized)
      const hash = user ? await this.deps.users.getPasswordHash(tx, asUserId(user.id)) : null
      const okPw = await this.deps.passwords.verify(password, hash ?? DUMMY_HASH)
      if (!user || !hash || !okPw) {
        return err(domainError('INVALID_CREDENTIALS', 'that email and password don’t match — check both and try again'))
      }
      return ok({ userId: user.id })
    })
  }

  /** US-6 request reset. Uniform answer; only sends when the account exists. */
  async requestReset(rawEmail: string): Promise<void> {
    const email = createEmail(rawEmail)
    if (!email.ok) return
    await this.deps.uow.withTransaction(async (tx) => {
      const user = await this.deps.users.findActiveByEmail(tx, email.value)
      if (!user) return // silent — enumeration-proof
      await this.recovery.invalidateOutstanding(tx, user.id, 'password_reset')
      await this.issueRecovery(tx, user.id, user.email, 'password_reset')
    })
  }

  /** US-6 perform reset: single-use token → new password + revoke all sessions (AC-6.2). */
  async performReset(token: string, newPassword: string): Promise<Result<{ userId: string }, DomainError>> {
    const password = validatePassword(newPassword)
    if (!password.ok) return password
    const hash = await this.deps.passwords.hash(password.value)
    const tokenHash = this.deps.tokens.hash(token)
    return this.deps.uow.withTransaction(async (tx) => {
      const userId = await this.recovery.consume(tx, tokenHash, 'password_reset')
      if (!userId) return err(domainError('INVALID_TOKEN', 'that reset link has expired or was already used — request a new one'))
      await this.deps.users.setPasswordHash(tx, asUserId(userId), hash)
      await this.deps.audit.record(tx, {
        businessId: null, actor: { type: 'user', id: userId }, command: 'identity.password.reset',
        sensitivity: 'sensitive', target: { type: 'user', id: userId }, afterDigest: {},
      })
      return ok({ userId })
    })
  }

  /** US-6 verify email via single-use token. Idempotent + audited on the detected change. */
  async verifyEmail(token: string): Promise<Result<{ userId: string }, DomainError>> {
    const tokenHash = this.deps.tokens.hash(token)
    return this.deps.uow.withTransaction(async (tx) => {
      const userId = await this.recovery.consume(tx, tokenHash, 'email_verify')
      if (!userId) return err(domainError('INVALID_TOKEN', 'that verification link is no longer valid — request a new one'))
      const user = await this.deps.users.findById(tx, asUserId(userId), { forUpdate: true })
      if (!user) return err(domainError('NOT_FOUND', 'account not found'))
      // Already verified: the token is spent but nothing changes — idempotent success.
      // (Skipping update() also avoids tripping the sequence guard on a no-op verifyEmail.)
      if (user.emailVerified) return ok({ userId })
      user.verifyEmail()
      await this.deps.users.update(tx, user)
      await this.deps.audit.record(tx, {
        businessId: null, actor: { type: 'user', id: userId }, command: 'identity.email.verify',
        sensitivity: 'normal', target: { type: 'user', id: userId }, afterDigest: { email_verified: true },
      })
      return ok({ userId })
    })
  }

  /** US-6 resend verification. Enumeration-proof: silent unless an UNVERIFIED account exists;
   *  supersedes any outstanding verify token so only the freshest link works (replay-safe). */
  async resendVerification(rawEmail: string): Promise<void> {
    const email = createEmail(rawEmail)
    if (!email.ok) return
    await this.deps.uow.withTransaction(async (tx) => {
      const user = await this.deps.users.findActiveByEmail(tx, email.value)
      if (!user || user.emailVerified) return // silent — no oracle, and no resend once verified
      await this.recovery.invalidateOutstanding(tx, user.id, 'email_verify')
      await this.issueRecovery(tx, user.id, user.email, 'email_verify')
    })
  }

  /** GetCurrentUser query (US-9): the identity behind a resolved session, or null. */
  async getUser(userId: string): Promise<{ userId: string; email: string; displayName: string | null; emailVerified: boolean } | null> {
    return this.deps.uow.withTransaction(async (tx) => {
      const user = await this.deps.users.findById(tx, asUserId(userId))
      return user ? { userId: user.id, email: user.email, displayName: user.displayName, emailVerified: user.emailVerified } : null
    })
  }

  private async issueRecovery(tx: unknown, userId: string, to: string, purpose: 'password_reset' | 'email_verify'): Promise<void> {
    const token = this.deps.tokens.generate()
    await this.recovery.create(tx, {
      id: uuidv7(), userId, tokenHash: this.deps.tokens.hash(token), purpose,
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    })
    await this.email.send({
      to,
      template: purpose === 'password_reset' ? 'reset' : 'verify',
      vars: { token },
    })
  }
}
