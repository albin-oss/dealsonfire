<script setup lang="ts">
/**
 * DofAvatar — person/store identity mark. Wraps reka-ui Avatar (graceful image
 * fallback to initials). Takes a src string at this layer; app-level media flows
 * resolve MediaRef → URL at the composition edge (the design system stays domain-blind).
 */
import { AvatarRoot, AvatarImage, AvatarFallback } from 'reka-ui'
import { computed } from 'vue'
import type { Size } from '../types'
import { cx } from '../utils/cx'

const SIZE_CLASS = { sm: 'size-7 text-caption', md: 'size-9 text-body', lg: 'size-12 text-emphasis' } as const

const props = withDefaults(defineProps<{
  name: string
  src?: string
  size?: Size
  /** Stores read square-ish; people read round. */
  shape?: 'circle' | 'square'
}>(), { size: 'md', shape: 'circle' })

const initials = computed(() =>
  props.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join(''))
const classes = computed(() => cx(
  'inline-flex shrink-0 items-center justify-center overflow-hidden bg-surface-sunken text-muted-foreground font-ui font-medium select-none',
  SIZE_CLASS[props.size],
  props.shape === 'circle' ? 'rounded-full' : 'rounded-medium',
))
</script>

<template>
  <AvatarRoot :class="classes" role="img" :aria-label="name">
    <!-- reka's fallback state machine is driven by the image's load status; with no
         image it never resolves — src-less avatars render initials directly. -->
    <template v-if="src">
      <AvatarImage :src="src" :alt="''" class="size-full object-cover" />
      <AvatarFallback :delay-ms="300">{{ initials }}</AvatarFallback>
    </template>
    <span v-else aria-hidden="true">{{ initials }}</span>
  </AvatarRoot>
</template>
