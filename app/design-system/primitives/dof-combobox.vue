<script setup lang="ts">
/**
 * DofCombobox — filterable one-of-many (reka Combobox): type to narrow, arrows to
 * move, Enter to pick. Matching is diacritic/case-folded with literal text (the
 * useSearch folding law). Items are data — virtualizable later without API break.
 */
import {
  ComboboxRoot, ComboboxAnchor, ComboboxInput, ComboboxTrigger,
  ComboboxContent, ComboboxViewport, ComboboxItem, ComboboxItemIndicator, ComboboxEmpty,
} from 'reka-ui'
import { computed, ref, watch } from 'vue'
import type { Size } from '../types'
import { cx } from '../utils/cx'
import DofField from './dof-field.vue'
import DofIcon from './dof-icon.vue'

export interface ComboOption {
  value: string
  label: string
  disabled?: boolean
}

const model = defineModel<string>()

const props = withDefaults(defineProps<{
  label: string
  items: ComboOption[]
  description?: string
  error?: string
  required?: boolean
  labelHidden?: boolean
  placeholder?: string
  size?: Size
  disabled?: boolean
  /** Copy for the no-matches state (educate, don't just say "none"). */
  emptyText: string
}>(), { placeholder: '', size: 'md', disabled: false })

const SIZE = { sm: 'min-h-9 px-3 text-caption', md: 'min-h-11 px-3.5 text-body', lg: 'min-h-12 px-4 text-emphasis' } as const

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

// reka v2 has no filter function — we filter (diacritic-folded, literal) and set ignore-filter
const term = ref('')
const open = ref(false)
watch(open, (isOpen) => { if (isOpen) term.value = '' })
const filteredItems = computed(() => {
  const folded = fold(term.value.trim())
  if (folded === '') return props.items
  return props.items.filter((item) => fold(item.label).includes(folded))
})

const anchorClass = computed(() => cx(
  'dof-interactive flex w-full items-center gap-2 rounded-medium border bg-surface-raised',
  'transition-colors tempo-instant ease-settle focus-within:focus-ring focus-within:border-accent',
  SIZE[props.size],
  props.error ? 'border-critical' : 'border-line',
  props.disabled && 'opacity-disabled pointer-events-none',
))
</script>

<template>
  <DofField v-slot="field" :label :description :error :required :label-hidden="labelHidden">
    <ComboboxRoot
      v-model="model"
      v-model:open="open"
      :disabled
      ignore-filter
      class="relative w-full"
    >
      <ComboboxAnchor :class="anchorClass">
        <ComboboxInput
          :id="field.inputId"
          class="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-faint-foreground"
          :placeholder
          :display-value="(v: string) => items.find((i) => i.value === v)?.label ?? ''"
          :aria-invalid="field.invalid || undefined"
          :aria-describedby="field.describedBy"
          @input="term = ($event.target as HTMLInputElement).value"
        />
        <ComboboxTrigger class="flex shrink-0 items-center text-muted-foreground">
          <DofIcon name="chevron-down" size="sm" />
        </ComboboxTrigger>
      </ComboboxAnchor>
      <ComboboxContent
        class="absolute top-full mt-1 w-full layer-overlay overflow-hidden rounded-medium border border-line bg-surface-raised shadow-overlay"
      >
        <ComboboxViewport class="max-h-72 p-1">
          <ComboboxEmpty class="px-2.5 py-3 text-caption text-muted-foreground">{{ emptyText }}</ComboboxEmpty>
          <ComboboxItem
            v-for="item in filteredItems"
            :key="item.value"
            :value="item.value"
            :disabled="item.disabled"
            class="flex cursor-pointer items-center justify-between gap-2 rounded-small px-2.5 py-2 font-ui text-body text-foreground outline-none data-highlighted:bg-surface-sunken data-disabled:opacity-disabled data-disabled:pointer-events-none"
          >
            {{ item.label }}
            <ComboboxItemIndicator><DofIcon name="check" size="sm" class="text-accent" /></ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxRoot>
  </DofField>
</template>
