<script setup lang="ts">
/**
 * DofNumberInput — quantities and counts. Text input with inputmode=decimal (the
 * native number type's UX failures are well documented), stepper buttons, arrow-key
 * stepping, min/max clamping. Model is number | null (empty is honest, never NaN).
 */
import { ref, watch } from 'vue'
import { useDsMessages } from '../i18n'
import type { Size } from '../types'
import DofInput from './dof-input.vue'
import DofIcon from './dof-icon.vue'

const model = defineModel<number | null>({ default: null })

const props = withDefaults(defineProps<{
  label: string
  description?: string
  error?: string
  required?: boolean
  size?: Size
  min?: number
  max?: number
  step?: number
  integer?: boolean
  disabled?: boolean
}>(), { size: 'md', step: 1, integer: false, disabled: false })

const messages = useDsMessages()
const text = ref(model.value === null ? '' : String(model.value))

watch(model, (value) => {
  const current = parse(text.value)
  if (current !== value) text.value = value === null ? '' : String(value)
})

function parse(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.')
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  return props.integer ? Math.trunc(n) : n
}

function clamp(n: number): number {
  let out = n
  if (props.min !== undefined) out = Math.max(props.min, out)
  if (props.max !== undefined) out = Math.min(props.max, out)
  return out
}

function commit() {
  const parsed = parse(text.value)
  model.value = parsed === null ? null : clamp(parsed)
  text.value = model.value === null ? '' : String(model.value)
}

function stepBy(direction: 1 | -1) {
  const base = model.value ?? (props.min ?? 0) - (direction === 1 ? props.step : -props.step)
  model.value = clamp(base + direction * props.step)
  text.value = String(model.value)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowUp') { event.preventDefault(); stepBy(1) }
  else if (event.key === 'ArrowDown') { event.preventDefault(); stepBy(-1) }
}
</script>

<template>
  <DofInput
    v-model="text"
    :label :description :error :required :size :disabled
    inputmode="decimal"
    @blur="commit"
    @keydown="onKeydown"
  >
    <template #suffix>
      <span class="-me-1 flex items-center gap-0.5">
        <button
          type="button"
          class="dof-interactive flex size-7 items-center justify-center rounded-small text-muted-foreground hover:bg-surface-sunken focus-visible:focus-ring"
          :aria-label="messages.input.decrement"
          tabindex="-1"
          @click="stepBy(-1)"
        >
          <DofIcon name="chevron-down" size="sm" />
        </button>
        <button
          type="button"
          class="dof-interactive flex size-7 items-center justify-center rounded-small text-muted-foreground hover:bg-surface-sunken focus-visible:focus-ring"
          :aria-label="messages.input.increment"
          tabindex="-1"
          @click="stepBy(1)"
        >
          <DofIcon name="chevron-up" size="sm" />
        </button>
      </span>
    </template>
  </DofInput>
</template>
