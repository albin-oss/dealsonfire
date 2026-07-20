/**
 * Onboarding progress engine (CAP-R1-MER-001). A PURE calculator: given the facts we can
 * truthfully know today, it returns the ordered ladder to the first sale — what's done,
 * the single next step, and what's still ahead. It never fabricates completion.
 *
 * Two kinds of rung:
 *  - LIVE rungs are computed from real state (account, email, business, store).
 *  - FUTURE rungs (product, inventory, shipping, first sale) are the honest roadmap —
 *    their features arrive in later releases, so they are always 'upcoming' here, never
 *    marked done. ("Do not implement future milestones.")
 *
 * Opportunity First, Complexity Last: exactly one rung is ever 'next'.
 */
export type MilestoneId =
  | 'account_created' | 'email_verified' | 'business_created' | 'store_created'
  | 'first_product' | 'inventory_configured' | 'shipping_configured' | 'first_sale'

export type MilestoneStatus = 'done' | 'next' | 'upcoming'

/** The facts we can currently determine (account existence is implied by an authed call). */
export interface MilestoneFacts {
  emailVerified: boolean
  hasBusiness: boolean
  hasStore: boolean
}

export interface Milestone {
  id: MilestoneId
  status: MilestoneStatus
}

export interface OnboardingProgress {
  milestones: Milestone[]
  completedCount: number
  totalCount: number
  stepsToFirstSale: number
  nextMilestoneId: MilestoneId | null
}

const LADDER: Array<{ id: MilestoneId; done: (f: MilestoneFacts) => boolean }> = [
  { id: 'account_created', done: () => true },
  { id: 'email_verified', done: (f) => f.emailVerified },
  { id: 'business_created', done: (f) => f.hasBusiness },
  { id: 'store_created', done: (f) => f.hasStore },
  { id: 'first_product', done: () => false },        // future rung — never faked done
  { id: 'inventory_configured', done: () => false },
  { id: 'shipping_configured', done: () => false },
  { id: 'first_sale', done: () => false },
]

export function computeOnboardingProgress(facts: MilestoneFacts): OnboardingProgress {
  let nextAssigned = false
  const milestones: Milestone[] = LADDER.map(({ id, done }) => {
    let status: MilestoneStatus
    if (done(facts)) status = 'done'
    else if (!nextAssigned) { status = 'next'; nextAssigned = true }
    else status = 'upcoming'
    return { id, status }
  })
  const completedCount = milestones.filter((m) => m.status === 'done').length
  return {
    milestones,
    completedCount,
    totalCount: milestones.length,
    stepsToFirstSale: milestones.length - completedCount,
    nextMilestoneId: milestones.find((m) => m.status === 'next')?.id ?? null,
  }
}
