<script setup lang="ts">
/**
 * DofReadinessSummary — DOF's universal "am I ready?" voice (UX-AUTHOR-002 §C1).
 * A CONFIDENCE indicator, structurally not a checklist: secured facts get a quiet ✓ and
 * their why; invitations get an open ○, an honest reason, and never block. The API forbids
 * the anti-patterns: no percent, no counts, no ordering churn, no urgency. Reused next by
 * Store publish readiness and Listing readiness.
 */
import DofIcon from './dof-icon.vue'
import DofText from './dof-text.vue'

export interface ReadinessSummaryItem {
  id: string
  label: string
  why: string
  state: 'secured' | 'invited'
}

defineProps<{
  title: string
  items: ReadinessSummaryItem[]
}>()
</script>

<template>
  <section v-if="items.length > 0" class="flex flex-col gap-2.5" :aria-label="title">
    <DofText role="caption" tone="muted" class="uppercase tracking-wide">{{ title }}</DofText>
    <ul class="flex list-none flex-col gap-2 p-0">
      <li v-for="item in items" :key="`${item.id}-${item.state}`" class="flex items-start gap-2.5">
        <DofIcon
          :name="item.state === 'secured' ? 'circle-check' : 'circle'"
          size="sm"
          class="mt-0.5 shrink-0"
          :class="item.state === 'secured' ? 'text-positive' : 'text-muted-foreground'"
        />
        <p class="m-0 font-ui text-body">
          <span :class="item.state === 'secured' ? 'font-medium text-foreground' : 'text-muted-foreground'">
            {{ item.label }}</span>
          <span class="sr-only">{{ item.state === 'secured' ? ' — added' : ' — optional' }}</span>
          <span class="text-muted-foreground"> — {{ item.why }}</span>
        </p>
      </li>
    </ul>
  </section>
</template>
