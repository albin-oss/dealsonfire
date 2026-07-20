/**
 * GuestClaimService (WP-R1-B1, US-7/8). Guest tokens (scope-generic; Orders binds order
 * refs in R1-B5) and the claim machinery (idempotent, audited). The Ignite Claim step
 * uses `claim()` to attach a founder's draft to their new account.
 */
import { ok, type Result } from '../../../shared/result'
import type { DomainError } from '../../../shared/errors'
import { uuidv7 } from '../../../platform/uuid'
import type { UnitOfWork, AuditLog } from '../../../platform/types'
import type { TokenHasher } from '../domain/ports'
import type { PgGuestTokenStore, PgClaimStore } from '../infrastructure/token-stores'

const GUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000

export class GuestClaimService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tokens: TokenHasher,
    private readonly guest: PgGuestTokenStore,
    private readonly claims: PgClaimStore,
    private readonly audit: AuditLog,
  ) {}

  /** Issue an opaque, hashed-at-rest guest token bound to a scope. Returns plaintext. */
  async issueGuestToken(scopeType: string, scopeRef: string): Promise<string> {
    const token = this.tokens.generate()
    await this.uow.withTransaction((tx) => this.guest.create(tx, {
      id: uuidv7(), tokenHash: this.tokens.hash(token), scopeType, scopeRef,
      expiresAt: new Date(Date.now() + GUEST_TTL_MS),
    }))
    return token
  }

  async resolveGuestToken(token: string): Promise<{ scopeType: string; scopeRef: string } | null> {
    return this.uow.withTransaction((tx) => this.guest.resolve(tx, this.tokens.hash(token)))
  }

  /** Who holds an artifact (null = unclaimed) — the corner-ownership check (Release 1.3). */
  async claimOwner(claimType: string, claimRef: string): Promise<string | null> {
    return this.uow.withTransaction((tx) => this.claims.owner(tx, claimType, claimRef))
  }

  /** The user's claimed artifact of a type — the corner-restore path (Release 1.3). */
  async findClaim(userId: string, claimType: string): Promise<string | null> {
    return this.uow.withTransaction((tx) => this.claims.findByUser(tx, userId, claimType))
  }

  /** Attach an artifact to a user. Idempotent — a second claim of the same artifact no-ops. */
  async claim(userId: string, claimType: string, claimRef: string): Promise<Result<{ outcome: 'claimed' | 'already' }, DomainError>> {
    return this.uow.withTransaction(async (tx) => {
      const outcome = await this.claims.claim(tx, { id: uuidv7(), userId, claimType, claimRef })
      if (outcome === 'claimed') {
        await this.audit.record(tx, {
          businessId: null, actor: { type: 'user', id: userId }, command: 'identity.claim',
          sensitivity: 'normal', target: { type: claimType, id: claimRef }, afterDigest: { outcome },
        })
      }
      return ok({ outcome })
    })
  }
}
