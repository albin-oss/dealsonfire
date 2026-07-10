<script setup lang="ts">
/**
 * DofCard — the base content surface. Elevation is honest (UX-BIBLE §11): `flat`
 * for static grouping, `raised` for interactive/focusable cards, never decorative.
 * The three-facts budget (§4.2) is a review rule; the component keeps slots simple
 * so violating it at least looks crowded.
 */
import { computed } from 'vue'
import { cx } from '../utils/cx'

const props = withDefaults(defineProps<{
  elevation?: 'flat' | 'raised'
  /** Interactive cards get hover/focus affordances and render as a button. */
  interactive?: boolean
}>(), { elevation: 'flat', interactive: false })

const emit = defineEmits<{ activate: [] }>()

const classes = computed(() => cx(
  'flex flex-col gap-3 rounded-large border border-line bg-surface-raised p-4 font-ui text-start',
  props.elevation === 'raised' && 'shadow-raised',
  props.interactive && 'dof-interactive cursor-pointer transition-shadow tempo-instant ease-settle hover:shadow-raised focus-visible:focus-ring',
))
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    :type="interactive ? 'button' : undefined"
    :class="classes"
    @click="interactive && emit('activate')"
  >
    <div v-if="$slots.header" class="flex items-start justify-between gap-3">
      <slot name="header" />
    </div>
    <slot />
    <div v-if="$slots.footer" class="flex items-center gap-2">
      <slot name="footer" />
    </div>
  </component>
</template>
