<script setup lang="ts">
/**
 * DofChip — an interactive token: active filters, picked values. Dismissible and/or
 * selectable; the dismiss control is a real button with a spoken label. Static
 * labeling belongs to DofTag; counts and status belong to DofBadge/DofStatus.
 */
import { useDsMessages } from '../i18n'
import { cx } from '../utils/cx'
import DofIcon from './dof-icon.vue'

const props = withDefaults(defineProps<{
  label: string
  dismissible?: boolean
  /** Selected filter state (aria-pressed when selectable). */
  selected?: boolean
  selectable?: boolean
  disabled?: boolean
}>(), { dismissible: false, selected: false, selectable: false, disabled: false })

const emit = defineEmits<{ dismiss: []; toggle: [] }>()
const messages = useDsMessages()
</script>

<template>
  <span
    :class="cx(
      'inline-flex items-center gap-1 rounded-full border font-ui text-caption transition-colors tempo-instant ease-settle',
      props.selected ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface-raised text-muted-foreground',
      props.disabled && 'opacity-disabled pointer-events-none',
      props.dismissible ? 'ps-2.5 pe-1 py-0.5' : 'px-2.5 py-0.5',
    )"
  >
    <button
      v-if="selectable"
      type="button"
      class="dof-interactive rounded-full focus-visible:focus-ring"
      :aria-pressed="selected"
      @click="emit('toggle')"
    >
      {{ label }}
    </button>
    <template v-else>{{ label }}</template>
    <button
      v-if="dismissible"
      type="button"
      class="dof-interactive flex size-5 items-center justify-center rounded-full hover:bg-surface-sunken focus-visible:focus-ring"
      :aria-label="`${messages.common.dismiss}: ${label}`"
      @click="emit('dismiss')"
    >
      <DofIcon name="x" size="sm" class="size-3.5" />
    </button>
  </span>
</template>
