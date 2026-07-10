/**
 * Session domain model (P2, WP-R1-B1 US-3/4/5). PURE lifecycle logic — no pg, no crypto,
 * no side effects. Owns the active/expired/revoked decision, the rolling/absolute expiry
 * rules, and the step-up freshness window. The application layer rehydrates persisted
 * rows into this model and asks it questions; the repository merely stores what it says.
 *
 * Fix surfaced by making this pure (P2): rolling expiry is CAPPED at the absolute expiry
 * — a session can never roll past its 90-day hard cap (the flat store math omitted this).
 */
export const SESSION_ROLLING_MS = 30 * 24 * 60 * 60 * 1000
export const SESSION_ABSOLUTE_MS = 90 * 24 * 60 * 60 * 1000
export const STEP_UP_WINDOW_MS = 5 * 60 * 1000

export interface SessionProps {
  id: string
  userId: string
  stepUpAt: Date | null
  createdAt: Date
  rollingExpiresAt: Date
  absoluteExpiresAt: Date
  revokedAt: Date | null
}

export class Session {
  private constructor(private readonly props: SessionProps) {}

  static rehydrate(props: SessionProps): Session {
    return new Session(props)
  }

  /** The initial expiry pair for a freshly issued session. */
  static initialExpiry(now: Date): { rollingExpiresAt: Date; absoluteExpiresAt: Date } {
    return {
      rollingExpiresAt: new Date(now.getTime() + SESSION_ROLLING_MS),
      absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
    }
  }

  get id() { return this.props.id }
  get userId() { return this.props.userId }
  get revoked() { return this.props.revokedAt !== null }

  /** Active = not revoked and within BOTH the rolling and absolute windows. */
  isActive(now: Date): boolean {
    if (this.props.revokedAt !== null) return false
    const t = now.getTime()
    return t < this.props.rollingExpiresAt.getTime() && t < this.props.absoluteExpiresAt.getTime()
  }

  /** Step-up is fresh only within the window (≤5 min — the frozen D-04 window). */
  isStepUpFresh(now: Date): boolean {
    if (this.props.stepUpAt === null) return false
    return now.getTime() - this.props.stepUpAt.getTime() <= STEP_UP_WINDOW_MS
  }

  /** The rolled-forward rolling expiry on activity — CAPPED at the absolute expiry. */
  rolledExpiry(now: Date): Date {
    const rolled = now.getTime() + SESSION_ROLLING_MS
    return new Date(Math.min(rolled, this.props.absoluteExpiresAt.getTime()))
  }
}
