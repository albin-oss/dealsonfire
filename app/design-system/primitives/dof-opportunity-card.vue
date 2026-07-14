<script setup lang="ts">
/**
 * DofOpportunityCard — THE Next Opportunity (UX-WORKSPACE-001 §9; PROMPT-022). The strict
 * grammar is the component's API: an imperative title, the reasoning ALWAYS shown (why now,
 * why this, why it matters — one sentence), exactly one primary action, and an optional,
 * respected "not now". A mentor's suggestion, never a task-manager item: no checkbox, no
 * badge count, no urgency theatrics. Permanent DS component — Pulse feeds the same card later.
 */
import { useDsMessages } from '../i18n'
import type { IconName } from '../icons/icons.generated'
import DofIcon from './dof-icon.vue'
import DofText from './dof-text.vue'
import DofButton from './dof-button.vue'

withDefaults(defineProps<{
  title: string
  /** The reasoning — required by design; a recommendation without a why does not render. */
  reasoning: string
  actionLabel: string
  icon?: IconName
  /** Offer a quiet "not now" (emits `later`); the caller owns the snooze semantics. */
  dismissible?: boolean
  busy?: boolean
}>(), { icon: 'sparkles', dismissible: false, busy: false })

const emit = defineEmits<{ act: []; later: [] }>()
const messages = useDsMessages()
</script>

<template>
  <section
    class="flex flex-col gap-3 rounded-large border border-accent/30 bg-accent/5 p-5"
    aria-labelledby="dof-opportunity-title"
  >
    <div class="flex items-start gap-3">
      <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15" aria-hidden="true">
        <DofIcon :name="icon" size="md" class="text-accent" />
      </span>
      <div class="flex flex-col gap-1">
        <DofText id="dof-opportunity-title" role="title" as="h2">{{ title }}</DofText>
        <DofText role="body" tone="muted">{{ reasoning }}</DofText>
      </div>
    </div>
    <div class="flex items-center gap-3 ps-12">
      <DofButton tone="accent" :loading="busy" @click="emit('act')">{{ actionLabel }}</DofButton>
      <DofButton v-if="dismissible" variant="ghost" tone="neutral" size="sm" @click="emit('later')">
        {{ messages.common.notNow }}
      </DofButton>
    </div>
  </section>
</template>
