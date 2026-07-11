<script setup lang="ts">
/**
 * Getting Started Timeline (CAP-R1-MER-001). The merchant's ladder to their first sale:
 * a words-first progress line ("You're N steps away") over a checklist whose single 'next'
 * rung carries the one action to take. Opportunity First — the next step is always the hero;
 * finished steps reassure, future steps preview. Curated guidance, no AI, no fake data.
 */
import { computed } from 'vue'
import { DofCard, DofText, DofIcon, DofButton, DofProgress, DofSkeleton } from '@ds/index'
import type { OnboardingProgressResponse } from '@contracts/schemas/merchant/onboarding.schema'

type Copy = { title: string; hint: string; cta?: { label: string; to: string } }
const LABELS: Record<string, Copy> = {
  account_created: { title: 'Account created', hint: 'You’re in — welcome to DOF.' },
  email_verified: { title: 'Verify your email', hint: 'Secures account recovery — you can keep selling meanwhile.', cta: { label: 'Confirm your email', to: '/verify' } },
  business_created: { title: 'Create your business', hint: 'The home everything else hangs off.', cta: { label: 'Create your business', to: '/onboarding' } },
  store_created: { title: 'Open your store', hint: 'Where buyers meet what you sell.', cta: { label: 'Open your store', to: '/ignite' } },
  first_product: { title: 'Add your first product', hint: 'One product, and DOF sets the table around it.', cta: { label: 'Add a product', to: '/products' } },
  inventory_configured: { title: 'Set up inventory', hint: 'Track what you have on hand.' },
  shipping_configured: { title: 'Set up shipping', hint: 'How orders reach your buyers.' },
  first_sale: { title: 'Make your first sale', hint: 'The moment it all becomes real.' },
}

const { data, pending, error } = useFetch<OnboardingProgressResponse>('/api/v1/workspace/progress', {
  lazy: true,
  server: false,
})

const stepsAway = computed(() => data.value?.steps_to_first_sale ?? 0)
</script>

<template>
  <DofCard>
    <template #header>
      <DofText role="emphasis" as="h2">Getting started</DofText>
    </template>

    <!-- loading: skeleton rungs -->
    <div v-if="pending" class="flex flex-col gap-3" aria-hidden="true">
      <DofSkeleton class="h-2 w-full" />
      <DofSkeleton v-for="n in 4" :key="n" class="h-6 w-3/4" />
    </div>

    <!-- graceful failure: never blocks the workspace -->
    <DofText v-else-if="error || !data" role="body" tone="muted">
      Your setup checklist will appear here in a moment.
    </DofText>

    <!-- the ladder -->
    <div v-else class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <DofText role="body">
          <template v-if="stepsAway > 0">You’re <strong>{{ stepsAway }}</strong> {{ stepsAway === 1 ? 'step' : 'steps' }} away from your first sale.</template>
          <template v-else>You’ve done everything on the list — nicely done.</template>
        </DofText>
        <DofProgress :value="data.completed_count" :max="data.total_count" :label="`${data.completed_count} of ${data.total_count} steps done`" />
      </div>

      <ol class="flex flex-col gap-2.5">
        <li
          v-for="m in data.milestones"
          :key="m.id"
          class="flex items-start gap-3"
          :class="m.status === 'upcoming' && 'opacity-60'"
        >
          <DofIcon
            :name="m.status === 'done' ? 'circle-check' : m.status === 'next' ? 'arrow-right' : 'clock'"
            size="sm"
            class="mt-0.5 shrink-0"
            :class="m.status === 'done' ? 'text-positive' : m.status === 'next' ? 'text-accent' : 'text-muted-foreground'"
          />
          <div class="flex flex-col gap-1">
            <DofText role="body" :tone="m.status === 'upcoming' ? 'muted' : 'default'">
              <span :class="m.status === 'next' && 'font-medium'">{{ LABELS[m.id]?.title ?? m.id }}</span>
            </DofText>
            <DofText v-if="m.status === 'next'" role="caption" tone="muted">{{ LABELS[m.id]?.hint }}</DofText>
            <DofButton
              v-if="m.status === 'next' && LABELS[m.id]?.cta"
              tone="accent"
              size="sm"
              class="mt-1 self-start"
              @click="navigateTo(LABELS[m.id]!.cta!.to)"
            >
              {{ LABELS[m.id]!.cta!.label }}
            </DofButton>
          </div>
        </li>
      </ol>
    </div>
  </DofCard>
</template>
