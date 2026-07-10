/**
 * SessionService (WP-R1-B1, US-3/4/5). Owns the session lifecycle: issue (token rotates
 * at login and step-up — AC-3.4), resolve (the spine of resolveAuth), rolling touch,
 * revoke, revoke-all, and the step-up window math (≤5 min — the frozen D-04 window).
 */
import { uuidv7 } from '../../../platform/uuid'
import type { UnitOfWork, EventStore } from '../../../platform/types'
import type { TokenHasher, Clock } from '../domain/ports'
import type { PgSessionStore } from '../infrastructure/session-store'
import { IDENTITY_EVENT, makeIdentityEvent, type SessionRevokedAllPayload } from '../domain/events'
import { Session, SESSION_ABSOLUTE_MS } from '../domain/session'

// Window constants are the pure model's (single source — P2); re-exported for callers.
export { SESSION_ROLLING_MS, SESSION_ABSOLUTE_MS, STEP_UP_WINDOW_MS } from '../domain/session'
export const SESSION_COOKIE = 'dof_session'

export interface ResolvedSession {
  sessionId: string
  userId: string
  stepUpVerified: boolean
}

export class SessionService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly sessions: PgSessionStore,
    private readonly tokens: TokenHasher,
    private readonly clock: Clock,
    private readonly eventStore: EventStore,
  ) {}

  /** Issue a fresh session; returns the PLAINTEXT token for the cookie (stored hashed). */
  async issue(userId: string, opts: { stepUp: boolean; userAgent: string | null }): Promise<string> {
    const token = this.tokens.generate()
    const expiry = Session.initialExpiry(this.clock.now())
    await this.uow.withTransaction((tx) => this.sessions.create(tx, {
      id: uuidv7(),
      userId,
      tokenHash: this.tokens.hash(token),
      stepUp: opts.stepUp,
      rollingExpiresAt: expiry.rollingExpiresAt,
      absoluteExpiresAt: expiry.absoluteExpiresAt,
      userAgent: opts.userAgent,
    }))
    return token
  }

  /** Resolve a cookie token → session context, rolling the expiry forward on the way. */
  async resolve(token: string): Promise<ResolvedSession | null> {
    const tokenHash = this.tokens.hash(token)
    return this.uow.withTransaction(async (tx) => {
      const record = await this.sessions.findActiveByTokenHash(tx, tokenHash)
      if (!record) return null
      const now = this.clock.now()
      // Rehydrate the pure model (createdAt derived exactly: absolute − 90d) and let it
      // decide. rolledExpiry is CAPPED at the absolute cutoff — the fix the model surfaced.
      const session = Session.rehydrate({
        id: record.id, userId: record.userId, stepUpAt: record.stepUpAt,
        createdAt: new Date(record.absoluteExpiresAt.getTime() - SESSION_ABSOLUTE_MS),
        rollingExpiresAt: record.rollingExpiresAt, absoluteExpiresAt: record.absoluteExpiresAt,
        revokedAt: record.revokedAt,
      })
      await this.sessions.touch(tx, session.id, session.rolledExpiry(now))
      return { sessionId: session.id, userId: session.userId, stepUpVerified: session.isStepUpFresh(now) }
    })
  }

  /** Mark a fresh step-up assertion on the current session (never issues a new session — AC-5.3). */
  async markStepUp(sessionId: string): Promise<void> {
    await this.uow.withTransaction((tx) => this.sessions.markStepUp(tx, sessionId))
  }

  async revoke(sessionId: string): Promise<void> {
    await this.uow.withTransaction((tx) => this.sessions.revoke(tx, sessionId))
  }

  /** Sign out everywhere (US-4); emits identity.session.revoked_all. */
  async revokeAll(userId: string, keepSessionId: string | null): Promise<number> {
    return this.uow.withTransaction(async (tx) => {
      const n = await this.sessions.revokeAllForUser(tx, userId, keepSessionId)
      await this.eventStore.append(tx, [makeIdentityEvent<SessionRevokedAllPayload>(
        IDENTITY_EVENT.SESSION_REVOKED_ALL, userId, { type: 'user', id: userId },
        { user_id: userId, kept_current: keepSessionId !== null },
      )])
      return n
    })
  }

  /** ListActiveSessions query (US-9): where a user is currently signed in. */
  async listActive(userId: string, currentSessionId: string | null): Promise<Array<{
    id: string; createdAt: Date; lastSeenAt: Date | null; userAgent: string | null; current: boolean
  }>> {
    const rows = await this.uow.withTransaction((tx) => this.sessions.listActiveByUser(tx, userId))
    return rows.map((r) => ({ ...r, current: r.id === currentSessionId }))
  }
}
