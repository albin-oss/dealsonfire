/**
 * Contract-first schema: GET /api/v1/workspace/progress (CAP-R1-MER-001).
 * The merchant's onboarding ladder to the first sale.
 */
import { z } from 'zod'

export const milestoneStatus = z.enum(['done', 'next', 'upcoming'])

export const onboardingProgressResponse = z.object({
  milestones: z.array(z.object({
    id: z.string(),
    status: milestoneStatus,
  })),
  completed_count: z.number().int(),
  total_count: z.number().int(),
  steps_to_first_sale: z.number().int(),
  next_milestone_id: z.string().nullable(),
  /** Release 0.8 — the facts behind "what should I publish today?" (null pre-store). */
  momentum: z.object({
    followers: z.number().int(),
    fires_this_week: z.number().int(),
    new_followers_this_week: z.number().int(),
    hours_quiet: z.number().int().nullable(),
    unsparked_product: z.object({ id: z.string().uuid(), title: z.string() }).nullable(),
  }).nullable(),
})
export type OnboardingProgressResponse = z.infer<typeof onboardingProgressResponse>
