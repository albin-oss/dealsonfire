<script setup lang="ts">
/**
 * DofJourneyCard — the Journey So Far (PROMPT-022). A business NARRATIVE, deliberately not
 * gamification: it shows only moments that actually happened (no locked slots, no points,
 * no percent bar), in the order they happened, in past-tense merchant language. Quiet by
 * construction — it reassures and then gets out of the way. Permanent DS component.
 */
import DofIcon from './dof-icon.vue'
import DofText from './dof-text.vue'

export interface JourneyCardMoment {
  id: string
  label: string
  detail?: string
}

defineProps<{
  title: string
  moments: JourneyCardMoment[]
}>()
</script>

<template>
  <section
    v-if="moments.length > 0"
    class="flex flex-col gap-3 rounded-large border border-line bg-surface-raised p-5"
    :aria-label="title"
  >
    <DofText role="emphasis" as="h2">{{ title }}</DofText>
    <ol class="flex list-none flex-col gap-2.5 p-0">
      <li v-for="moment in moments" :key="moment.id" class="flex items-start gap-3">
        <DofIcon name="circle-check" size="sm" class="mt-0.5 shrink-0 text-positive" />
        <div class="flex flex-col">
          <DofText role="body">{{ moment.label }}</DofText>
          <DofText v-if="moment.detail" role="caption" tone="muted">{{ moment.detail }}</DofText>
        </div>
      </li>
    </ol>
  </section>
</template>
