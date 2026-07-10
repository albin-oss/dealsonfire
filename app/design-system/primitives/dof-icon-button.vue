<script setup lang="ts">
/**
 * DofIconButton — icon-only action. The spoken label is a REQUIRED prop (an unlabeled
 * icon button cannot be built); an optional tooltip mirrors it for sighted users.
 */
import { computed } from 'vue'
import type { Size, Tone, Variant } from '../types'
import type { IconName } from '../icons/icons.generated'
import { cx } from '../utils/cx'
import DofIcon from './dof-icon.vue'
import DofTooltip from './dof-tooltip.vue'

const props = withDefaults(defineProps<{
  icon: IconName
  /** Spoken (and tooltip) name of the action. */
  label: string
  variant?: Variant
  tone?: Tone
  size?: Size
  disabled?: boolean
  loading?: boolean
  /** Show the label as a tooltip on hover/focus. */
  tooltip?: boolean
}>(), { variant: 'ghost', tone: 'neutral', size: 'md', disabled: false, loading: false, tooltip: true })

const emit = defineEmits<{ click: [MouseEvent] }>()

const SIZE = { sm: 'size-8', md: 'size-10', lg: 'size-12' } as const
const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-foreground', accent: 'text-accent', positive: 'text-positive',
  caution: 'text-caution', critical: 'text-critical', info: 'text-info', ember: 'text-ember',
}
// explicit map — Tailwind cannot see constructed class names
const SOLID: Record<Tone, string> = {
  neutral: 'bg-foreground text-surface hover:opacity-90',
  accent: 'bg-accent text-on-accent hover:opacity-90',
  positive: 'bg-positive text-on-accent hover:opacity-90',
  caution: 'bg-caution text-on-accent hover:opacity-90',
  critical: 'bg-critical text-on-accent hover:opacity-90',
  info: 'bg-info text-on-accent hover:opacity-90',
  ember: 'bg-ember text-on-ember hover:opacity-90',
}

const inert = computed(() => props.disabled || props.loading)
const classes = computed(() => cx(
  'dof-interactive inline-flex shrink-0 items-center justify-center rounded-medium transition-colors tempo-instant ease-settle focus-visible:focus-ring',
  SIZE[props.size],
  props.variant === 'solid' && SOLID[props.tone],
  props.variant === 'soft' && cx('bg-surface-sunken hover:bg-line/60', TONE_TEXT[props.tone]),
  props.variant === 'outline' && cx('border border-line hover:bg-surface-sunken', TONE_TEXT[props.tone]),
  props.variant === 'ghost' && cx('hover:bg-surface-sunken', TONE_TEXT[props.tone]),
  inert.value && 'opacity-disabled pointer-events-none',
))
</script>

<template>
  <DofTooltip v-if="tooltip && !inert" :text="label">
    <button type="button" :class="classes" :disabled="inert" :aria-label="label" :aria-busy="loading || undefined" @click="emit('click', $event)">
      <DofIcon :name="loading ? 'loader-circle' : icon" size="sm" :class="loading && 'animate-spin'" />
    </button>
  </DofTooltip>
  <button v-else type="button" :class="classes" :disabled="inert" :aria-label="label" :aria-busy="loading || undefined" @click="emit('click', $event)">
    <DofIcon :name="loading ? 'loader-circle' : icon" size="sm" :class="loading && 'animate-spin'" />
  </button>
</template>
