<script setup lang="ts">
/**
 * DofStatus — a state fact: dot + word (color never carries meaning alone — §11).
 * Quiet, factual, never pulsing (states don't beg for attention; deadlines do,
 * and those are notices).
 */
import type { Tone } from '../types'
import { cx } from '../utils/cx'

const DOT: Record<Tone, string> = {
  neutral: 'bg-faint-foreground',
  accent: 'bg-accent',
  positive: 'bg-positive',
  caution: 'bg-caution',
  critical: 'bg-critical',
  info: 'bg-info',
  ember: 'bg-ember',
}

const props = withDefaults(defineProps<{
  /** The state, as a word: "active", "draft", "paused — back May 4". */
  label: string
  tone?: Tone
}>(), { tone: 'neutral' })
</script>

<template>
  <span class="inline-flex items-center gap-1.5 font-ui text-caption text-muted-foreground">
    <span :class="cx('size-2 shrink-0 rounded-full', DOT[props.tone])" aria-hidden="true" />
    {{ label }}
  </span>
</template>
