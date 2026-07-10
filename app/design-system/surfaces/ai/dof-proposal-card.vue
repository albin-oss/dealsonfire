<script setup lang="ts">
/**
 * DofProposalCard — the quartet made visible (ADR-005 §2.1; DESIGN-SYSTEM-001 §8):
 * intent · evidence (cited) · assumptions (never collapsed away) · confidence
 * (calibrated language). A dumb renderer by law — pair with useProposal at the call
 * site; the card cannot be constructed without evidence, and approval follows the
 * signature spec (never default-focused; declining is consequence-free and typed).
 */
import type { Confidence, DeclineReason, ProposalStatus } from '../../patterns/composables/use-proposal'
import type { RClass } from '../../types'
import { useDsMessages } from '../../i18n'
import { cx } from '../../utils/cx'
import DofIcon from '../../primitives/dof-icon.vue'
import DofText from '../../primitives/dof-text.vue'
import DofBadge from '../../primitives/dof-badge.vue'
import DofButton from '../../primitives/dof-button.vue'
import DofConfidence from './dof-confidence.vue'

const props = withDefaults(defineProps<{
  intent: string
  evidence: string[]
  assumptions?: string[]
  confidence: Confidence
  rClass: RClass
  status?: ProposalStatus
  /** Who is speaking — 'Ignite' by convention. */
  speaker?: string
  /** Label of the approval act: "Approve", "Make it my store". */
  approveLabel?: string
}>(), { assumptions: () => [], status: 'pending', speaker: 'Ignite' })

if (props.intent.trim() === '' || props.evidence.length === 0) {
  throw new Error('a proposal card requires intent and evidence — unexplainable recommendations are unrenderable (DS-11)')
}

const emit = defineEmits<{ approve: []; decline: [reason: DeclineReason] }>()
const messages = useDsMessages()

const STATUS_TONE = { pending: 'neutral', approving: 'neutral', approved: 'positive', declined: 'neutral', expired: 'neutral' } as const
</script>

<template>
  <article class="flex flex-col gap-3 rounded-large border border-line bg-surface-raised p-4 font-ui shadow-raised">
    <header class="flex items-center justify-between gap-2">
      <span class="flex min-w-0 items-center gap-2">
        <DofIcon name="sparkles" size="sm" class="shrink-0 text-muted-foreground" />
        <DofText role="caption" tone="muted" as="span">{{ speaker }}</DofText>
        <DofConfidence :confidence />
      </span>
      <DofBadge :tone="STATUS_TONE[status]">{{ status === 'pending' ? rClass : status }}</DofBadge>
    </header>

    <DofText role="emphasis" as="h3">{{ intent }}</DofText>

    <ul class="flex flex-col gap-1" aria-label="evidence">
      <li v-for="line in evidence" :key="line" class="flex items-start gap-2 text-body text-muted-foreground">
        <DofIcon name="trending-up" size="sm" class="mt-0.5 shrink-0" />
        <span class="min-w-0">{{ line }}</span>
      </li>
    </ul>

    <ul v-if="assumptions.length > 0" class="flex flex-col gap-1" aria-label="assumptions">
      <li v-for="line in assumptions" :key="line" class="flex items-start gap-2 text-caption text-faint-foreground">
        <DofIcon name="circle-help" size="sm" class="mt-0.5 shrink-0 size-3.5" />
        <span class="min-w-0">{{ line }}</span>
      </li>
    </ul>

    <div v-if="$slots.preview" class="rounded-medium border border-line bg-surface p-3">
      <slot name="preview" />
    </div>

    <slot />

    <footer v-if="status === 'pending' || status === 'approving'" class="flex flex-wrap items-center gap-2 pt-1">
      <DofButton
        tone="accent"
        :loading="status === 'approving'"
        :class="cx('me-auto')"
        @click="emit('approve')"
      >
        {{ approveLabel ?? messages.ignite.approve }}
      </DofButton>
      <DofButton variant="ghost" tone="neutral" @click="emit('decline', 'not_now')">{{ messages.ignite.notNow }}</DofButton>
      <DofButton variant="ghost" tone="neutral" @click="emit('decline', 'not_ever')">{{ messages.ignite.notEver }}</DofButton>
    </footer>
  </article>
</template>
