<script setup lang="ts">
/** DofTextarea — multi-line entry; grows with content up to a calm maximum. */
import { computed } from 'vue'
import { cx } from '../utils/cx'
import DofField from './dof-field.vue'

const model = defineModel<string>({ default: '' })

const props = withDefaults(defineProps<{
  label: string
  description?: string
  error?: string
  required?: boolean
  labelHidden?: boolean
  placeholder?: string
  disabled?: boolean
  rows?: number
  maxlength?: number
}>(), { disabled: false, rows: 4 })

const areaClass = computed(() => cx(
  'w-full resize-y rounded-medium border bg-surface-raised px-3.5 py-2.5 text-body text-foreground',
  'placeholder:text-faint-foreground transition-colors tempo-instant ease-settle',
  'focus-visible:focus-ring focus-visible:border-accent max-h-96 font-ui',
  props.error ? 'border-critical' : 'border-line',
  props.disabled && 'opacity-disabled pointer-events-none',
))
</script>

<template>
  <DofField v-slot="field" :label :description :error :required :label-hidden="labelHidden">
    <textarea
      :id="field.inputId"
      v-model="model"
      :class="areaClass"
      :placeholder
      :disabled
      :rows
      :maxlength
      :required="field.required || undefined"
      :aria-invalid="field.invalid || undefined"
      :aria-describedby="field.describedBy"
    />
  </DofField>
</template>
