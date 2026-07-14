<script setup lang="ts">
/**
 * Workspace Home — the Business Companion (UX-WORKSPACE-001 §8, Concept A "The Coach's
 * Feed"; PROMPT-022). Two complementary sections over ONE progress read: the Next
 * Opportunity (the single most valuable action now, with its reasoning) and the Journey
 * So Far (what we've already accomplished — a narrative, never a scoreboard). Posture-aware:
 * coach today; operator/advisor grow in as their facts (first sale, repeat activity) become
 * real. Honest empty states still teach what each space becomes (no fake business data, ever).
 */
import { computed, ref, watch } from 'vue'
import {
  DofText, DofCard, DofEmptyState, DofButton, DofFeedLayout, DofIcon, DofSkeleton,
  DofOpportunityCard, DofJourneyCard,
} from '@ds/index'
import type { OnboardingProgressResponse } from '@contracts/schemas/merchant/onboarding.schema'
import { derivePosture, selectOpportunity, journeyMoments } from '../composables/workspace-companion'

// US-9: workspace requires a session (session mode only; dev leaves it open).
definePageMeta({ middleware: 'auth' })

const router = useRouter()
useHead({ title: 'Home — DOF' })

// One read, two views (opportunity + journey). Lazy + client-side: the shell paints
// instantly; a failed read degrades to the standing Ignite invitation — never a broken hero.
const { data: progress, pending } = useFetch<OnboardingProgressResponse>('/api/v1/workspace/progress', {
  lazy: true,
  server: false,
})

const posture = computed(() => derivePosture(progress.value ?? null))
const opportunity = computed(() => selectOpportunity(progress.value ?? null))
const journey = computed(() => journeyMoments(progress.value ?? null))

// The hero announces only when it CHANGES (a completed step reveals the next one) —
// never on initial load (UX-WORKSPACE-001 §19).
const heroLive = ref(false)
watch(() => opportunity.value.id, (_next, prev) => { if (prev) heroLive.value = true })

// "Not now" is respected for the session — the hero yields quietly to the actions row.
const snoozed = ref(false)

const greeting = computed(() =>
  posture.value === 'coach' ? 'Welcome to your workspace' : 'Here’s how things stand')
</script>

<template>
  <DofFeedLayout>
    <section class="flex flex-col gap-1 pb-2">
      <DofText role="headline" as="h1">{{ greeting }}</DofText>
      <DofText role="body" tone="muted">
        Everything starts with one product. Add it, and DOF sets the table around it.
      </DofText>
    </section>

    <!-- ——— the Next Opportunity: ONE, with its reasoning always shown.
         Client-only: progress arrives after mount; SSR must not render a branch the
         client immediately replaces (hydration). -->
    <ClientOnly>
      <div :aria-live="heroLive ? 'polite' : undefined">
        <DofSkeleton v-if="pending" class="h-28 w-full rounded-large" />
        <DofOpportunityCard
          v-else-if="!snoozed"
          :title="opportunity.title"
          :reasoning="opportunity.reasoning"
          :action-label="opportunity.actionLabel"
          :icon="opportunity.icon"
          dismissible
          @act="router.push(opportunity.to)"
          @later="snoozed = true"
        />
      </div>
    </ClientOnly>

    <section aria-label="quick actions" class="flex flex-wrap gap-2">
      <!-- a mentor never says the same thing twice: the ember action yields while the hero
           is already pointing at Ignite -->
      <DofButton v-if="snoozed || opportunity.to !== '/ignite'" tone="ember" icon="flame" @click="router.push('/ignite')">Create your store — about 4 minutes</DofButton>
      <DofButton variant="soft" tone="accent" icon="plus" @click="router.push('/products')">Add your first product</DofButton>
      <DofButton variant="soft" tone="neutral" icon="store" @click="router.push('/store')">See your store</DofButton>
      <DofButton variant="soft" tone="neutral" icon="tag" @click="router.push('/deals')">Plan a deal</DofButton>
    </section>

    <DofCard>
      <template #header>
        <DofText role="emphasis" as="h2">How you're doing</DofText>
      </template>
      <DofEmptyState
        icon="trending-up"
        title="Your business health appears here"
        why="After your first sales, this becomes a sentence — “Twice your usual Tuesday” — never a wall of charts."
      />
    </DofCard>

    <DofCard>
      <template #header>
        <DofText role="emphasis" as="h2">Continue where you left off</DofText>
      </template>
      <DofEmptyState
        icon="clock"
        title="Nothing in progress"
        why="Drafts and half-finished work reappear here — nothing you start is ever lost."
      />
    </DofCard>

    <DofCard>
      <template #header>
        <DofText role="emphasis" as="h2">Recent activity</DofText>
      </template>
      <DofEmptyState
        icon="shopping-bag"
        title="Orders and events land here"
        why="A short to-do list with money attached — needs-action first, always."
      />
    </DofCard>

    <!-- ——— the Journey So Far: only what actually happened; silent until it has a story -->
    <ClientOnly>
      <DofJourneyCard title="The story so far" :moments="journey" />
    </ClientOnly>

    <template #rail>
      <DofCard>
        <template #header>
          <span class="flex items-center gap-2">
            <DofIcon name="sparkles" size="sm" class="text-muted-foreground" />
            <DofText role="emphasis" as="h2">Ignite</DofText>
          </span>
        </template>
        <DofText role="body" tone="muted">
          Your partner-in-business arrives here: proposals with the evidence attached, never noise. Quiet until useful.
        </DofText>
      </DofCard>
      <DofCard>
        <template #header>
          <DofText role="emphasis" as="h2">Opportunities</DofText>
        </template>
        <DofEmptyState
          icon="lightbulb"
          title="Opportunities appear with data"
          why="Real signals from your store — “142 views, no deal running” — not manufactured urgency."
        />
      </DofCard>
    </template>
  </DofFeedLayout>
</template>
