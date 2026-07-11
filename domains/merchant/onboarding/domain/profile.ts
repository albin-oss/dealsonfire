/**
 * OnboardingProfile aggregate (CAP-R1-MER-002). A first-class, editable, VERSIONED merchant
 * concept, keyed by the person (userId) — deliberately NOT coupled to auth or to a merchant
 * account (which may not exist yet during discovery). Each real change bumps the version
 * (the audit log is the version history); identical patches are silent no-ops (D-29).
 */
import type { OnboardingAnswers } from './answers'

export type OnboardingStatus = 'in_progress' | 'completed'

export interface OnboardingProfileProps {
  userId: string
  answers: OnboardingAnswers
  status: OnboardingStatus
  version: number
  completedAt: Date | null
}

export class OnboardingProfile {
  private constructor(private readonly props: OnboardingProfileProps) {}

  /** A fresh profile for a user who is starting discovery. */
  static start(userId: string): OnboardingProfile {
    return new OnboardingProfile({ userId, answers: {}, status: 'in_progress', version: 0, completedAt: null })
  }

  /** Rehydrate persisted state; a row the domain cannot explain is an outage, not a guess. */
  static rehydrate(props: OnboardingProfileProps): OnboardingProfile {
    if (!props.userId) throw new Error('corrupt onboarding_profile: missing userId')
    if (props.status !== 'in_progress' && props.status !== 'completed') throw new Error(`corrupt onboarding_profile: status=${props.status}`)
    if (!Number.isInteger(props.version) || props.version < 0) throw new Error(`corrupt onboarding_profile: version=${props.version}`)
    if (props.answers === null || typeof props.answers !== 'object') throw new Error('corrupt onboarding_profile: answers not an object')
    return new OnboardingProfile(props)
  }

  get userId() { return this.props.userId }
  get answers(): OnboardingAnswers { return { ...this.props.answers } }
  get status() { return this.props.status }
  get version() { return this.props.version }
  get completedAt() { return this.props.completedAt }

  /**
   * Merge a validated answer patch. Returns true iff something actually changed (bumping the
   * version); an identical patch is a silent no-op. Editing after completion reopens nothing —
   * it just records the newer answers and bumps the version (profiles stay editable).
   */
  applyAnswers(patch: OnboardingAnswers): boolean {
    const merged = { ...this.props.answers, ...patch }
    if (JSON.stringify(merged) === JSON.stringify(this.props.answers)) return false
    this.props.answers = merged
    this.props.version += 1
    return true
  }

  /** Mark discovery complete. Idempotent: completing an already-complete profile changes nothing. */
  complete(now: Date): boolean {
    if (this.props.status === 'completed') return false
    this.props.status = 'completed'
    this.props.completedAt = now
    this.props.version += 1
    return true
  }

  toProps(): OnboardingProfileProps {
    return { ...this.props, answers: { ...this.props.answers } }
  }
}
