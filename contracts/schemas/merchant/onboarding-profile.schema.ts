/**
 * Contract-first schemas for the onboarding discovery API (CAP-R1-MER-002).
 */
import { z } from 'zod'
import {
  BUSINESS_STAGES, SELL_TYPES, CHANNELS, PLATFORMS, TEAM_SIZES, MONTHLY_ORDERS,
} from '@domains/merchant/onboarding/domain/answers'

export const onboardingAnswers = z.object({
  business_stage: z.enum(BUSINESS_STAGES).optional(),
  sell_types: z.array(z.enum(SELL_TYPES)).optional(),
  channels: z.array(z.enum(CHANNELS)).optional(),
  current_platform: z.enum(PLATFORMS).optional(),
  team_size: z.enum(TEAM_SIZES).optional(),
  monthly_orders: z.enum(MONTHLY_ORDERS).optional(),
}).strict()

/** PUT /onboarding — save a partial answer patch (save-and-resume). */
export const saveOnboardingRequest = z.object({
  answers: onboardingAnswers,
}).strict()

const recommendation = z.object({
  suggested_business_type: z.string(),
  dashboard_layout: z.string(),
  recommended_modules: z.array(z.string()),
  marketplace_readiness_score: z.number().int(),
  suggested_store_config: z.object({
    needs_shipping: z.boolean(),
    needs_scheduling: z.boolean(),
    digital_first: z.boolean(),
  }),
  next_step: z.literal('create_business'),
})

/** GET /onboarding — the full profile: answers, progress, and the live recommendation. */
export const onboardingProfileResponse = z.object({
  answers: onboardingAnswers,
  status: z.enum(['in_progress', 'completed']),
  version: z.number().int(),
  completed_at: z.string().nullable(),
  answered_count: z.number().int(),
  total_questions: z.number().int(),
  recommendation,
})

export type SaveOnboardingRequest = z.infer<typeof saveOnboardingRequest>
export type OnboardingProfileResponse = z.infer<typeof onboardingProfileResponse>
