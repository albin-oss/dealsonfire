<script setup lang="ts">
/**
 * DofEmptyState — empty states teach the opportunity (frozen, ADR-001 §11; UX-BIBLE
 * §6.4). The contract is API-shaped: what this space becomes (title), why it's worth
 * it (why), one action, and the effort named. A bare "No items" cannot be built with
 * this component — which is the point.
 */
import type { IconName } from '../../icons/icons.generated'
import DofIcon from '../../primitives/dof-icon.vue'
import DofText from '../../primitives/dof-text.vue'

withDefaults(defineProps<{
  icon: IconName
  /** What this space becomes: "Your first deal". */
  title: string
  /** Why it's worth it: "Stores running deals get 3× the visits." */
  why: string
  /** The named effort: "30 seconds". Rendered with the action slot. */
  effort?: string
  /** Heading element — match the surrounding outline (headings only increase by one). */
  headingAs?: 'h2' | 'h3' | 'h4'
}>(), { headingAs: 'h3' })
</script>

<template>
  <div class="flex flex-col items-center gap-3 rounded-large border border-dashed border-line px-6 py-12 text-center font-ui">
    <span class="flex size-12 items-center justify-center rounded-full bg-surface-sunken text-muted-foreground">
      <DofIcon :name="icon" size="lg" />
    </span>
    <div class="flex max-w-sm flex-col gap-1">
      <DofText role="emphasis" :as="headingAs">{{ title }}</DofText>
      <DofText role="body" tone="muted" as="p">{{ why }}</DofText>
    </div>
    <div class="mt-1 flex items-center gap-3">
      <slot name="action" />
      <DofText v-if="effort" role="caption" tone="faint" as="span">{{ effort }}</DofText>
    </div>
  </div>
</template>
