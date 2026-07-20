/**
 * PgOnboardingProfileRepository (CAP-R1-MER-002). Persistence-only: upsert-by-user and
 * rehydrate. The domain owns the version/merge rules; this stores what it decides.
 */
import type { Tx } from '../../../../platform/types'
import { asClient } from '../../../../platform/db'
import { OnboardingProfile } from '../domain/profile'
import type { OnboardingAnswers } from '../domain/answers'

interface Row {
  user_id: string
  answers: OnboardingAnswers
  status: string
  version: string
  completed_at: Date | null
}

export class PgOnboardingProfileRepository {
  async findByUser(tx: Tx, userId: string): Promise<OnboardingProfile | null> {
    const { rows } = await asClient(tx).query<Row>(
      `SELECT user_id, answers, status, version, completed_at FROM onboarding_profiles WHERE user_id = $1`, [userId])
    const r = rows[0]
    if (!r) return null
    return OnboardingProfile.rehydrate({
      userId: r.user_id,
      answers: r.answers ?? {},
      status: r.status === 'completed' ? 'completed' : 'in_progress',
      version: Number(r.version),
      completedAt: r.completed_at,
    })
  }

  async upsert(tx: Tx, profile: OnboardingProfile): Promise<void> {
    const p = profile.toProps()
    await asClient(tx).query(
      `INSERT INTO onboarding_profiles (user_id, answers, status, version, completed_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         answers = $2, status = $3, version = $4, completed_at = $5, updated_at = now()`,
      [p.userId, JSON.stringify(p.answers), p.status, p.version, p.completedAt])
  }
}
