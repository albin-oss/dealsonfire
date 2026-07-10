<script setup lang="ts">
/**
 * DofSelect — one-of-many choice over reka-ui Select (typeahead, arrow keys,
 * portal positioning). Items are data, not slots — keeps usage declarative and
 * the listbox virtualizable later without an API break.
 */
import {
  SelectRoot, SelectTrigger, SelectValue, SelectPortal, SelectContent,
  SelectViewport, SelectItem, SelectItemText, SelectItemIndicator,
} from 'reka-ui'
import { computed } from 'vue'
import type { Size } from '../types'
import { cx } from '../utils/cx'
import DofField from './dof-field.vue'
import DofIcon from './dof-icon.vue'

export interface SelectItemOption {
  value: string
  label: string
  disabled?: boolean
}

const model = defineModel<string>()

const props = withDefaults(defineProps<{
  label: string
  items: SelectItemOption[]
  description?: string
  error?: string
  required?: boolean
  labelHidden?: boolean
  placeholder?: string
  size?: Size
  disabled?: boolean
}>(), { placeholder: 'Choose…', size: 'md', disabled: false })

const SIZE = { sm: 'min-h-9 px-3 text-caption', md: 'min-h-11 px-3.5 text-body', lg: 'min-h-12 px-4 text-emphasis' } as const

const triggerClass = computed(() => cx(
  'dof-interactive flex w-full items-center justify-between gap-2 rounded-medium border bg-surface-raised text-start font-ui text-foreground',
  'transition-colors tempo-instant ease-settle focus-visible:focus-ring data-[placeholder]:text-faint-foreground',
  SIZE[props.size],
  props.error ? 'border-critical' : 'border-line',
  props.disabled && 'opacity-disabled pointer-events-none',
))
</script>

<template>
  <DofField v-slot="field" :label :description :error :required :label-hidden="labelHidden">
    <SelectRoot v-model="model" :disabled :required="field.required">
      <SelectTrigger
        :id="field.inputId"
        :class="triggerClass"
        :aria-invalid="field.invalid || undefined"
        :aria-describedby="field.describedBy"
      >
        <SelectValue :placeholder />
        <DofIcon name="chevron-down" size="sm" class="text-muted-foreground" />
      </SelectTrigger>
      <SelectPortal>
        <SelectContent
          position="popper"
          side="bottom"
          :side-offset="4"
          class="layer-overlay min-w-(--reka-select-trigger-width) overflow-hidden rounded-medium border border-line bg-surface-raised shadow-overlay"
        >
          <SelectViewport class="max-h-72 p-1">
            <SelectItem
              v-for="item in items"
              :key="item.value"
              :value="item.value"
              :disabled="item.disabled"
              class="flex cursor-pointer items-center justify-between gap-2 rounded-small px-2.5 py-2 font-ui text-body text-foreground outline-none data-highlighted:bg-surface-sunken data-disabled:opacity-disabled data-disabled:pointer-events-none"
            >
              <SelectItemText>{{ item.label }}</SelectItemText>
              <SelectItemIndicator><DofIcon name="check" size="sm" class="text-accent" /></SelectItemIndicator>
            </SelectItem>
          </SelectViewport>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>
  </DofField>
</template>
