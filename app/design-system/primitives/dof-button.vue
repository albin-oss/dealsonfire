<script setup lang="ts">
/**
 * DofButton — the one primary action per screen lives here (UX-BIBLE §4.2).
 * Variants × tones from types.ts; `ember` renders only for heat surfaces.
 * Loading is a first-class state (aria-busy, input preserved, label kept for width).
 */
import { computed, useAttrs } from 'vue'
import type { Size, Tone, Variant } from '../types'
import { cx } from '../utils/cx'
import DofIcon from './dof-icon.vue'
import type { IconName } from '../icons/icons.generated'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  variant?: Variant
  tone?: Tone
  size?: Size
  disabled?: boolean
  loading?: boolean
  icon?: IconName
  /** Renders as <a> (or any tag) while keeping button semantics where needed. */
  as?: string
  type?: 'button' | 'submit' | 'reset'
}>(), { variant: 'solid', tone: 'neutral', size: 'md', disabled: false, loading: false, as: 'button', type: 'button' })

const emit = defineEmits<{ click: [event: MouseEvent] }>()
const attrs = useAttrs()

const SIZE = {
  sm: 'text-caption gap-1.5 px-3 min-h-9',
  md: 'text-body gap-2 px-4 min-h-11',
  lg: 'text-emphasis gap-2 px-5 min-h-12',
} as const

const STYLES: Record<Variant, Record<Tone, string>> = {
  solid: {
    neutral: 'bg-foreground text-surface hover:opacity-90',
    accent: 'bg-accent text-on-accent hover:bg-accent-strong',
    positive: 'bg-positive text-on-accent hover:opacity-90',
    caution: 'bg-caution text-on-accent hover:opacity-90',
    critical: 'bg-critical text-on-accent hover:opacity-90',
    info: 'bg-info text-on-accent hover:opacity-90',
    ember: 'bg-ember text-on-ember hover:opacity-90',
  },
  soft: {
    neutral: 'bg-surface-sunken text-foreground hover:bg-line/60',
    accent: 'bg-accent/10 text-accent hover:bg-accent/15',
    positive: 'bg-positive/10 text-positive hover:bg-positive/15',
    caution: 'bg-caution/10 text-caution hover:bg-caution/15',
    critical: 'bg-critical/10 text-critical hover:bg-critical/15',
    info: 'bg-info/10 text-info hover:bg-info/15',
    ember: 'bg-ember/10 text-ember hover:bg-ember/15',
  },
  outline: {
    neutral: 'border border-line text-foreground hover:bg-surface-sunken',
    accent: 'border border-accent/40 text-accent hover:bg-accent/5',
    positive: 'border border-positive/40 text-positive hover:bg-positive/5',
    caution: 'border border-caution/40 text-caution hover:bg-caution/5',
    critical: 'border border-critical/40 text-critical hover:bg-critical/5',
    info: 'border border-info/40 text-info hover:bg-info/5',
    ember: 'border border-ember/40 text-ember hover:bg-ember/5',
  },
  ghost: {
    neutral: 'text-foreground hover:bg-surface-sunken',
    accent: 'text-accent hover:bg-accent/10',
    positive: 'text-positive hover:bg-positive/10',
    caution: 'text-caution hover:bg-caution/10',
    critical: 'text-critical hover:bg-critical/10',
    info: 'text-info hover:bg-info/10',
    ember: 'text-ember hover:bg-ember/10',
  },
}

const inert = computed(() => props.disabled || props.loading)
const classes = computed(() => cx(
  'dof-interactive inline-flex items-center justify-center select-none rounded-medium font-ui font-medium',
  'transition-colors tempo-instant ease-settle focus-visible:focus-ring',
  SIZE[props.size], STYLES[props.variant][props.tone],
  inert.value && 'opacity-disabled pointer-events-none',
))

function onClick(event: MouseEvent) {
  if (inert.value) return
  emit('click', event)
}
</script>

<template>
  <component
    :is="as"
    v-bind="attrs"
    :type="as === 'button' ? type : undefined"
    :class="classes"
    :disabled="as === 'button' ? inert : undefined"
    :aria-disabled="as !== 'button' && inert ? 'true' : undefined"
    :aria-busy="loading ? 'true' : undefined"
    @click="onClick"
  >
    <DofIcon v-if="loading" name="loader-circle" :size="size === 'lg' ? 'md' : 'sm'" class="animate-spin" />
    <DofIcon v-else-if="icon" :name="icon" :size="size === 'lg' ? 'md' : 'sm'" />
    <slot />
  </component>
</template>
