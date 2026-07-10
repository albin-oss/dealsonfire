<script setup lang="ts">
/**
 * DofText — the typographic voice. Role maps to the type scale (tokens §2.2);
 * tone maps to text roles. Element defaults follow the role's semantics but stay
 * overridable via `as` (visual hierarchy ⊥ document outline).
 */
import { computed } from 'vue'
import { cx } from '../utils/cx'

const ROLE_CLASS = {
  caption: 'text-caption',
  body: 'text-body',
  emphasis: 'text-emphasis font-medium',
  title: 'text-title font-semibold',
  headline: 'text-headline font-semibold',
  display: 'text-display font-bold tracking-tight',
} as const
const ROLE_TAG = { caption: 'span', body: 'p', emphasis: 'p', title: 'h2', headline: 'h1', display: 'h1' } as const
const TONE_CLASS = { default: 'text-foreground', muted: 'text-muted-foreground', faint: 'text-faint-foreground' } as const

const props = withDefaults(defineProps<{
  role?: keyof typeof ROLE_CLASS
  tone?: keyof typeof TONE_CLASS
  as?: string
  /** Long-form content gets the reading measure and font. */
  reading?: boolean
}>(), { role: 'body', tone: 'default', reading: false })

const tag = computed(() => props.as ?? ROLE_TAG[props.role])
const classes = computed(() => cx(
  'font-ui', ROLE_CLASS[props.role], TONE_CLASS[props.tone],
  props.reading && 'font-reading max-w-prose',
))
</script>

<template>
  <component :is="tag" :class="classes"><slot /></component>
</template>
