<script setup lang="ts">
/**
 * DofSplitButton — one primary action + related secondaries behind a dropdown
 * (the one-primary-action budget with an honest escape hatch). The dropdown half
 * carries its own spoken label; item contract is DofDropdown's MenuItem.
 */
import type { Size, Tone } from '../types'
import type { MenuItem } from './dof-dropdown.vue'
import DofButton from './dof-button.vue'
import DofDropdown from './dof-dropdown.vue'
import DofIcon from './dof-icon.vue'
import { cx } from '../utils/cx'

withDefaults(defineProps<{
  /** Primary action label. */
  label: string
  /** Spoken label for the menu half: "More save options". */
  menuLabel: string
  items: MenuItem[]
  tone?: Tone
  size?: Size
  loading?: boolean
  disabled?: boolean
}>(), { tone: 'accent', size: 'md', loading: false, disabled: false })

const emit = defineEmits<{ click: [MouseEvent]; select: [id: string] }>()

const SIZE_MENU = { sm: 'min-h-9 px-2', md: 'min-h-11 px-2.5', lg: 'min-h-12 px-3' } as const
</script>

<template>
  <span class="inline-flex items-stretch">
    <DofButton
      :tone :size :loading :disabled
      variant="solid"
      class="rounded-e-none"
      @click="emit('click', $event)"
    >
      {{ label }}
    </DofButton>
    <DofDropdown :items @select="(id) => emit('select', id)">
      <button
        type="button"
        :disabled="disabled || loading"
        :aria-label="menuLabel"
        :class="cx(
          'dof-interactive inline-flex items-center justify-center rounded-e-medium border-s border-surface/30 font-ui',
          'bg-accent text-on-accent transition-colors tempo-instant ease-settle hover:bg-accent-strong focus-visible:focus-ring',
          SIZE_MENU[size],
          (disabled || loading) && 'opacity-disabled pointer-events-none',
        )"
      >
        <DofIcon name="chevron-down" size="sm" />
      </button>
    </DofDropdown>
  </span>
</template>
