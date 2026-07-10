<script setup lang="ts">
/**
 * DofField — shared field chrome (label · description · error) with the ARIA wiring
 * every input inherits: ids generated once, error takes describedby precedence and
 * announces politely. Errors educate (principle #12): the `error` string is expected
 * to teach the next step, and the slot receives the wiring to bind.
 */
import { computed, useId } from 'vue'

const props = defineProps<{
  label: string
  description?: string
  error?: string
  required?: boolean
  /** Visually hide the label (still announced). Use sparingly — labels are calm, not clutter. */
  labelHidden?: boolean
}>()

const inputId = useId()
const descriptionId = useId()
const errorId = useId()

const describedBy = computed(() => {
  const ids: string[] = []
  if (props.error) ids.push(errorId)
  if (props.description) ids.push(descriptionId)
  return ids.length > 0 ? ids.join(' ') : undefined
})

defineExpose({ inputId })
</script>

<template>
  <div class="flex flex-col gap-1.5 font-ui">
    <label
      :for="inputId"
      class="text-caption font-medium text-foreground"
      :class="labelHidden && 'sr-only'"
    >
      {{ label }}<span v-if="required" aria-hidden="true" class="text-critical"> *</span>
    </label>
    <slot
      :input-id="inputId"
      :described-by="describedBy"
      :invalid="Boolean(error)"
      :required="required ?? false"
    />
    <p v-if="error" :id="errorId" class="text-caption text-critical" aria-live="polite">{{ error }}</p>
    <p v-if="description" :id="descriptionId" class="text-caption text-muted-foreground">{{ description }}</p>
  </div>
</template>
