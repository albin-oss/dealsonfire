<script setup lang="ts">
/**
 * DofBadge — quiet, factual status marks. Soft by default (the calm dress code);
 * never pulses, never counts unread (UX-BIBLE §15 anti-patterns are API-shaped here:
 * there is no "notification dot" mode).
 */
import { computed } from 'vue'
import type { Tone } from '../types'
import { cx } from '../utils/cx'

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-foreground',
  accent: 'bg-accent/10 text-accent',
  positive: 'bg-positive/10 text-positive',
  caution: 'bg-caution/10 text-caution',
  critical: 'bg-critical/10 text-critical',
  info: 'bg-info/10 text-info',
  ember: 'bg-ember/10 text-ember',
}

const props = withDefaults(defineProps<{ tone?: Tone }>(), { tone: 'neutral' })
const classes = computed(() => cx(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium font-ui',
  TONE_CLASS[props.tone],
))
</script>

<template>
  <span :class="classes"><slot /></span>
</template>
