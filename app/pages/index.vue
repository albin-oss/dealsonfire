<script setup lang="ts">
/**
 * Workspace landing (UI-COM-001 §2) — the Pulse-shaped home before Pulse's brain
 * exists: welcome, then honest empty states that teach what each space becomes
 * (no fake business data, ever). Quick actions lead with what the merchant could do.
 */
import { DofText, DofCard, DofEmptyState, DofButton, DofFeedLayout, DofIcon } from '@ds/index'
import GettingStarted from '../components/workspace/GettingStarted.vue'

// US-9: workspace requires a session (session mode only; dev leaves it open).
definePageMeta({ middleware: 'auth' })

const router = useRouter()
useHead({ title: 'Home — DOF' })
</script>

<template>
  <DofFeedLayout>
    <section class="flex flex-col gap-1 pb-2">
      <DofText role="headline" as="h1">Welcome to your workspace</DofText>
      <DofText role="body" tone="muted">
        Everything starts with one product. Add it, and DOF sets the table around it.
      </DofText>
    </section>

    <section aria-label="quick actions" class="flex flex-wrap gap-2">
      <DofButton tone="ember" icon="flame" @click="router.push('/ignite')">Create your store — about 4 minutes</DofButton>
      <DofButton variant="soft" tone="accent" icon="plus" @click="router.push('/products')">Add your first product</DofButton>
      <DofButton variant="soft" tone="neutral" icon="store" @click="router.push('/store')">See your store</DofButton>
      <DofButton variant="soft" tone="neutral" icon="tag" @click="router.push('/deals')">Plan a deal</DofButton>
    </section>

    <!-- the first-login hero: where you are, what's next, how close to a first sale.
         Client-only: its progress is fetched after mount, so SSR must not render a
         branch the client will immediately replace (avoids hydration mismatch). -->
    <ClientOnly>
      <GettingStarted />
    </ClientOnly>

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
