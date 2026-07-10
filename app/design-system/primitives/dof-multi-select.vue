<script setup lang="ts">
/**
 * DofMultiSelect — several-of-many over reka Combobox (multiple): picked values
 * render as removable chips, typing narrows the rest. Model is string[].
 */
import {
  ComboboxRoot, ComboboxAnchor, ComboboxInput, ComboboxTrigger,
  ComboboxContent, ComboboxViewport, ComboboxItem, ComboboxItemIndicator, ComboboxEmpty,
} from 'reka-ui'
import { computed, ref, watch } from 'vue'
import { cx } from '../utils/cx'
import DofField from './dof-field.vue'
import DofIcon from './dof-icon.vue'
import DofChip from './dof-chip.vue'

export interface MultiOption {
  value: string
  label: string
  disabled?: boolean
}

const model = defineModel<string[]>({ default: () => [] })

const props = withDefaults(defineProps<{
  label: string
  items: MultiOption[]
  description?: string
  error?: string
  required?: boolean
  placeholder?: string
  disabled?: boolean
  emptyText: string
}>(), { placeholder: '', disabled: false })

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

const selected = computed(() => model.value.map((v) => props.items.find((i) => i.value === v)).filter((i) => i !== undefined))

function remove(value: string) {
  model.value = model.value.filter((v) => v !== value)
}

const anchorClass = computed(() => cx(
  'dof-interactive flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-medium border bg-surface-raised px-2.5 py-1.5 text-body',
  'transition-colors tempo-instant ease-settle focus-within:focus-ring focus-within:border-accent',
  props.error ? 'border-critical' : 'border-line',
  props.disabled && 'opacity-disabled pointer-events-none',
))
</script>

<template>
  <DofField v-slot="field" :label :description :error :required>
    <ComboboxRoot
      v-model="model"
      multiple
      v-model:open="open"
      :disabled
      ignore-filter
      class="relative w-full"
    >
      <ComboboxAnchor :class="anchorClass">
        <DofChip
          v-for="item in selected"
          :key="item.value"
          :label="item.label"
          dismissible
          @dismiss="remove(item.value)"
        />
        <ComboboxInput
          :id="field.inputId"
          class="min-w-24 flex-1 bg-transparent text-foreground outline-none placeholder:text-faint-foreground"
          :placeholder="selected.length === 0 ? placeholder : ''"
          :aria-invalid="field.invalid || undefined"
          :aria-describedby="field.describedBy"
          @input="term = ($event.target as HTMLInputElement).value"
        />
        <ComboboxTrigger class="ms-auto flex shrink-0 items-center text-muted-foreground">
          <DofIcon name="chevron-down" size="sm" />
        </ComboboxTrigger>
      </ComboboxAnchor>
      <ComboboxContent class="absolute top-full mt-1 w-full layer-overlay overflow-hidden rounded-medium border border-line bg-surface-raised shadow-overlay">
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
