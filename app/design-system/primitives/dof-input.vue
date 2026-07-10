<script setup lang="ts">
/**
 * DofInput — single-line text entry with the shared field chrome, prefix/suffix
 * slots (icons, currency marks, clear buttons), and a loading state for async-
 * validated fields. Specialized inputs (password/search/money/…) compose this.
 * Errors arrive as props, already educated — the component never invents validation.
 */
import { computed, ref } from 'vue'
import type { Size } from '../types'
import { cx } from '../utils/cx'
import DofField from './dof-field.vue'
import DofIcon from './dof-icon.vue'

const model = defineModel<string>({ default: '' })

const props = withDefaults(defineProps<{
  label: string
  description?: string
  error?: string
  required?: boolean
  labelHidden?: boolean
  size?: Size
  type?: 'text' | 'email' | 'url' | 'tel' | 'password' | 'search'
  placeholder?: string
  disabled?: boolean
  loading?: boolean
  autocomplete?: string
  inputmode?: 'text' | 'decimal' | 'numeric' | 'email' | 'url' | 'search' | 'tel'
  /** Forwarded focus/blur hooks for composing inputs. */
  name?: string
}>(), { size: 'md', type: 'text', disabled: false, loading: false })

const emit = defineEmits<{ blur: [FocusEvent]; focus: [FocusEvent] }>()

const SIZE = { sm: 'min-h-9 text-caption', md: 'min-h-11 text-body', lg: 'min-h-12 text-emphasis' } as const
const PAD = { sm: 'px-3', md: 'px-3.5', lg: 'px-4' } as const

const inputEl = ref<HTMLInputElement | null>(null)
defineExpose({ focus: () => inputEl.value?.focus(), select: () => inputEl.value?.select() })

const wrapperClass = computed(() => cx(
  'dof-interactive flex w-full items-center gap-2 rounded-medium border bg-surface-raised',
  'transition-colors tempo-instant ease-settle focus-within:focus-ring focus-within:border-accent',
  SIZE[props.size], PAD[props.size],
  props.error ? 'border-critical' : 'border-line',
  props.disabled && 'opacity-disabled pointer-events-none',
))
</script>

<template>
  <DofField v-slot="field" :label :description :error :required :label-hidden="labelHidden">
    <div :class="wrapperClass">
      <span v-if="$slots.prefix" class="flex shrink-0 items-center text-muted-foreground">
        <slot name="prefix" />
      </span>
      <input
        :id="field.inputId"
        ref="inputEl"
        v-model="model"
        :type
        class="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-faint-foreground"
        :placeholder
        :disabled
        :name
        :autocomplete
        :inputmode
        :required="field.required || undefined"
        :aria-invalid="field.invalid || undefined"
        :aria-describedby="field.describedBy"
        :aria-busy="loading || undefined"
        @blur="emit('blur', $event)"
        @focus="emit('focus', $event)"
      >
      <DofIcon v-if="loading" name="loader-circle" size="sm" class="shrink-0 animate-spin text-faint-foreground" />
      <span v-if="$slots.suffix" class="flex shrink-0 items-center text-muted-foreground">
        <slot name="suffix" />
      </span>
    </div>
  </DofField>
</template>
