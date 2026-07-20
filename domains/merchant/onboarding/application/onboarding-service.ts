/**
 * OnboardingService (CAP-R1-MER-002). Orchestrates discovery: load-or-start the profile,
 * merge answers (save-and-resume), complete, and assemble the personalized view (answers +
 * progress + live recommendation). One transaction per write; audited on the detected change
 * (the audit log is the version history). No new domain events — discovery is private.
 */
import type { UnitOfWork, AuditLog } from '../../../../platform/types'
import { OnboardingProfile } from '../domain/profile'
import { recommend, type Recommendation } from '../domain/recommendation'
import type { OnboardingAnswers } from '../domain/answers'
import type { PgOnboardingProfileRepository } from '../infrastructure/onboarding-repository'

const TOTAL_QUESTIONS = 6

/** Map the application view to the wire contract (snake_case). */
export function onboardingViewToResponse(v: OnboardingView) {
  return {
    answers: v.answers,
    status: v.status,
    version: v.version,
    completed_at: v.completedAt ? v.completedAt.toISOString() : null,
    answered_count: v.answeredCount,
    total_questions: v.totalQuestions,
    recommendation: v.recommendation,
  }
}

export interface OnboardingView {
  answers: OnboardingAnswers
  status: 'in_progress' | 'completed'
  version: number
  completedAt: Date | null
  answeredCount: number
  totalQuestions: number
  recommendation: Recommendation
}

export class OnboardingService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly repo: PgOnboardingProfileRepository,
    private readonly audit: AuditLog,
  ) {}

  async get(userId: string): Promise<OnboardingView> {
    const profile = await this.uow.withTransaction((tx) => this.repo.findByUser(tx, userId))
    return this.view(profile ?? OnboardingProfile.start(userId))
  }

  async save(userId: string, patch: OnboardingAnswers): Promise<OnboardingView> {
    return this.uow.withTransaction(async (tx) => {
      const profile = (await this.repo.findByUser(tx, userId)) ?? OnboardingProfile.start(userId)
      if (profile.applyAnswers(patch)) {
        await this.repo.upsert(tx, profile)
        await this.audit.record(tx, {
          businessId: null, actor: { type: 'user', id: userId }, command: 'merchant.onboarding.save',
          sensitivity: 'normal', target: { type: 'onboarding', id: userId },
          afterDigest: { version: profile.version, answered: Object.keys(profile.answers).length },
        })
      }
      return this.view(profile)
    })
  }

  async complete(userId: string): Promise<OnboardingView> {
    return this.uow.withTransaction(async (tx) => {
      const profile = (await this.repo.findByUser(tx, userId)) ?? OnboardingProfile.start(userId)
      if (profile.complete(new Date())) {
        await this.repo.upsert(tx, profile)
        await this.audit.record(tx, {
          businessId: null, actor: { type: 'user', id: userId }, command: 'merchant.onboarding.complete',
          sensitivity: 'normal', target: { type: 'onboarding', id: userId },
          afterDigest: { suggested_business_type: recommend(profile.answers).suggested_business_type },
        })
      }
      return this.view(profile)
    })
  }

  private view(profile: OnboardingProfile): OnboardingView {
    const answers = profile.answers
    return {
      answers,
      status: profile.status,
      version: profile.version,
      completedAt: profile.completedAt,
      answeredCount: Object.keys(answers).length,
      totalQuestions: TOTAL_QUESTIONS,
      recommendation: recommend(answers),
    }
  }
}
