<script setup lang="ts">
/** DofTag — a static categorization label with optional icon. Never interactive (that's DofChip). */
import type { Tone } from '../types'
import type { IconName } from '../icons/icons.generated'
import { cx } from '../utils/cx'
import DofIcon from './dof-icon.vue'

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'border-line text-muted-foreground',
  accent: 'border-accent/30 text-accent',
  positive: 'border-positive/30 text-positive',
  caution: 'border-caution/30 text-caution',
  critical: 'border-critical/30 text-critical',
  info: 'border-info/30 text-info',
  ember: 'border-ember/30 text-ember',
}

const props = withDefaults(defineProps<{
  label: string
  tone?: Tone
  icon?: IconName
}>(), { tone: 'neutral' })
</script>

<template>
  <span :class="cx('inline-flex items-center gap-1 rounded-small border bg-surface-raised px-2 py-0.5 font-ui text-caption', TONE_CLASS[props.tone])">
    <DofIcon v-if="icon" :name="icon" size="sm" class="size-3.5" />
    {{ label }}
  </span>
</template>
