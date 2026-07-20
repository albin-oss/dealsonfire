/**
 * The Workspace Companion engine (UX-WORKSPACE-001 §8/§9, PROMPT-022). PURE functions over
 * the progress facts: derive the posture, select THE Next Opportunity (one, with its
 * reasoning), and tell the Journey So Far (only what actually happened — a narrative,
 * never a collectible grid). Every recommendation answers why-now/why-this/why-it-matters
 * in one sentence, validated against Opportunity First / Grandma / Progressive / Invisible.
 *
 * Rejected on those principles (documented per the brief):
 *  - "Explore your analytics" pre-activation — cognitive load, no business value yet.
 *  - Showing upcoming milestones in the Journey — locked slots are gamification, not narrative.
 *  - Multiple simultaneous hero opportunities — decision fatigue; the rail may hold quiet
 *    runners-up, the hero is ONE.
 */
import type { OnboardingProgressResponse } from '@contracts/schemas/merchant/onboarding.schema'
import type { IconName } from '@ds/index'

export type WorkspacePosture = 'coach' | 'operator' | 'advisor'

export interface Opportunity {
  id: string
  /** Imperative title — what to do. */
  title: string
  /** The reasoning, always shown: why now, why this, why it matters — one sentence. */
  reasoning: string
  actionLabel: string
  to: string
  icon: IconName
}

export interface JourneyMoment {
  id: string
  label: string
  detail: string
}

/**
 * Posture from facts, never a toggle. Today first_sale/returning are future rungs, so
 * every merchant is 'coach' — the thresholds are real and take effect the day the facts do.
 */
export function derivePosture(progress: OnboardingProgressResponse | null): WorkspacePosture {
  if (!progress) return 'coach'
  const done = new Set(progress.milestones.filter((m) => m.status === 'done').map((m) => m.id))
  if (!done.has('first_sale')) return 'coach'
  // Advisor needs sustained signal (repeat activity) — a fact Pulse will supply; until
  // then a first sale graduates the merchant to operator.
  return 'operator'
}

/**
 * Momentum guidance (Release 0.8): once a store stands, the true publishing facts
 * outrank the ladder's guesses (the ladder cannot see products or sparks — momentum
 * proves them). Null when nothing warrants a nudge.
 */
function momentumOpportunity(progress: OnboardingProgressResponse | null): Opportunity | null {
  const momentum = progress?.momentum
  if (!momentum) return null
  if (momentum.followers > 0 && (momentum.hours_quiet === null || momentum.hours_quiet >= 48)) {
    const people = momentum.followers === 1 ? '1 person follows' : `${momentum.followers} people follow`
    return {
      id: 'morning-spark', title: 'Say good morning',
      reasoning: `${people} your store and it's been quiet a while — one honest line lands on their Home today.`,
      actionLabel: 'Write a spark', to: '/sparks', icon: 'flame',
    }
  }
  if (momentum.unsparked_product) {
    return {
      id: 'spark-product', title: `Give “${momentum.unsparked_product.title}” its moment`,
      reasoning: 'It’s on your shelf but you’ve never told anyone — a spark travels further than a listing.',
      actionLabel: 'Spark it', to: `/sparks?about=${momentum.unsparked_product.id}`, icon: 'sparkles',
    }
  }
  return null
}

export interface Pulse {
  sentence: string
  actionLabel: string
  to: string
}

/**
 * The pulse (Release 1.2) — "How you're doing" as ONE encouraging sentence built from
 * facts the merchant earned. Never statistics for their own sake; every sentence ends
 * in a next action. Null = keep teaching the empty state.
 */
export function pulseSentence(progress: OnboardingProgressResponse | null): Pulse | null {
  const m = progress?.momentum
  if (!m) return null
  const followerWord = (n: number) => (n === 1 ? 'person' : 'people')
  if (m.fires_this_week > 0 && m.new_followers_this_week > 0) {
    return {
      sentence: `This week: ${m.fires_this_week} ${m.fires_this_week === 1 ? 'fire' : 'fires'} on your posts and ${m.new_followers_this_week} new ${followerWord(m.new_followers_this_week)} following — your words are working.`,
      actionLabel: 'Write today’s spark', to: '/sparks',
    }
  }
  if (m.new_followers_this_week > 0) {
    return {
      sentence: `${m.new_followers_this_week} new ${followerWord(m.new_followers_this_week)} followed your shop this week — they’ll see your next post on their Home.`,
      actionLabel: 'Say hello with a spark', to: '/sparks',
    }
  }
  if (m.fires_this_week > 0) {
    return {
      sentence: `Your posts earned ${m.fires_this_week} ${m.fires_this_week === 1 ? 'fire' : 'fires'} this week — people saw this.`,
      actionLabel: 'Keep the streak honest', to: '/sparks',
    }
  }
  if (m.followers > 0) {
    return {
      sentence: `${m.followers} ${followerWord(m.followers)} follow your shop — everything you publish lands on their Home.`,
      actionLabel: 'Give them something today', to: '/sparks',
    }
  }
  return null
}

/** THE Next Opportunity. A null/failed progress read degrades to the launch invitation. */
export function selectOpportunity(progress: OnboardingProgressResponse | null): Opportunity {
  const next = progress?.next_milestone_id ?? null
  switch (next) {
    case 'email_verified':
      return {
        id: 'verify-email', title: 'Confirm your email',
        reasoning: 'Two clicks now protects password recovery forever — and you can keep selling meanwhile.',
        actionLabel: 'Confirm email', to: '/verify', icon: 'circle-check',
      }
    case 'business_created':
      return {
        id: 'create-business', title: 'Create your business',
        reasoning: 'Everything else — your store, products, deals — hangs off this one five-minute step.',
        actionLabel: 'Start now', to: '/onboarding', icon: 'sparkles',
      }
    case 'store_created':
      return {
        id: 'open-store', title: 'Open your store',
        reasoning: 'Your business has a name; give it a door — Ignite drafts the whole storefront in about four minutes.',
        actionLabel: 'Open your store', to: '/ignite', icon: 'store',
      }
    case 'first_product':
      return momentumOpportunity(progress) ?? {
        id: 'first-product', title: 'Put something on the shelf',
        reasoning: 'Your store is live but the shelves are bare — one product turns visitors into customers.',
        actionLabel: 'Add a product', to: '/products', icon: 'package',
      }
    case 'inventory_configured':
    case 'shipping_configured':
    case 'first_sale':
      return momentumOpportunity(progress) ?? {
        id: 'share-store', title: 'Share your store',
        reasoning: 'The shelf is stocked — your first sale is one shared link away.',
        actionLabel: 'See your store', to: '/store', icon: 'send',
      }
    default:
      // no progress data (fresh error, signed-out edge) or ladder complete → the standing invitation
      return {
        id: 'ignite', title: 'Create your store',
        reasoning: 'From idea to open doors in about four minutes — DOF drafts everything, you approve.',
        actionLabel: 'Start Ignite', to: '/ignite', icon: 'flame',
      }
  }
}

const MOMENTS: Record<string, { label: string; detail: string }> = {
  account_created: { label: 'You joined DOF', detail: 'Where this story starts.' },
  email_verified: { label: 'Email confirmed', detail: 'Your account is fully protected.' },
  business_created: { label: 'Business launched', detail: 'It has a name now.' },
  store_created: { label: 'Store published', detail: 'Open to the world.' },
  first_product: { label: 'First product on the shelf', detail: 'From idea to inventory.' },
  inventory_configured: { label: 'Inventory set up', detail: 'You know what you have.' },
  shipping_configured: { label: 'Shipping ready', detail: 'Promises you can keep.' },
  first_sale: { label: 'First sale', detail: 'The moment it became real.' },
}

/** The Journey So Far: ONLY completed milestones, in order — a narrative, not a scoreboard. */
export function journeyMoments(progress: OnboardingProgressResponse | null): JourneyMoment[] {
  if (!progress) return []
  return progress.milestones
    .filter((m) => m.status === 'done')
    .map((m) => ({ id: m.id, label: MOMENTS[m.id]?.label ?? m.id, detail: MOMENTS[m.id]?.detail ?? '' }))
}

/**
 * Contextual mobile fifth slot (UX-WORKSPACE-001 §7): when the next milestone lives in a
 * nav module, that module earns the last tab slot. Null = no swap (the default holds).
 * Grows richer with real activity facts (running deal → deals, unfulfilled → orders).
 */
export function contextualFifthId(progress: OnboardingProgressResponse | null): string | null {
  switch (progress?.next_milestone_id) {
    case 'store_created': return 'store'
    case 'first_product': return 'products'
    case 'inventory_configured': return 'inventory'
    case 'shipping_configured': return 'shipping'
    case 'first_sale': return 'deals'
    default: return null
  }
}
