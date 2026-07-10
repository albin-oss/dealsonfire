<script setup lang="ts">
/**
 * DofSearchInput — the blessed search field: search icon, one-tap/Esc clear,
 * loading for in-flight server queries. Pairs with useSearch (bind `query`).
 */
import { computed } from 'vue'
import { useDsMessages } from '../i18n'
import type { Size } from '../types'
import DofInput from './dof-input.vue'
import DofIcon from './dof-icon.vue'

const model = defineModel<string>({ default: '' })

withDefaults(defineProps<{
  label: string
  placeholder?: string
  size?: Size
  loading?: boolean
  disabled?: boolean
}>(), { size: 'md', loading: false, disabled: false })

const messages = useDsMessages()
const hasQuery = computed(() => model.value !== '')

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && hasQuery.value) {
    event.stopPropagation()
    model.value = ''
  }
}
</script>

<template>
  <DofInput
    v-model="model"
    :label :placeholder :size :loading :disabled
    label-hidden
    type="search"
    inputmode="search"
    @keydown="onKeydown"
  >
    <template #prefix>
      <DofIcon name="search" size="sm" />
    </template>
    <template #suffix>
      <button
        v-if="hasQuery"
        type="button"
        class="dof-interactive -me-1 flex size-8 items-center justify-center rounded-small text-muted-foreground hover:bg-surface-sunken focus-visible:focus-ring"
        :aria-label="messages.input.clearSearch"
        @click="model = ''"
      >
        <DofIcon name="x" size="sm" />
      </button>
    </template>
  </DofInput>
</template>
