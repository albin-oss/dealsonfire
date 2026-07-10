<script setup lang="ts">
/**
 * DofRadioGroup — one-of-few choice with descriptions (choice-of-three is a
 * constitutional pattern — the Mirror). Roving tabindex and arrow keys via reka-ui.
 */
import { RadioGroupRoot, RadioGroupItem, RadioGroupIndicator } from 'reka-ui'
import { useId } from 'vue'
import { cx } from '../utils/cx'

export interface RadioOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

const model = defineModel<string>()

const props = withDefaults(defineProps<{
  label: string
  options: RadioOption[]
  disabled?: boolean
}>(), { disabled: false })

const labelId = useId()
</script>

<template>
  <div class="flex flex-col gap-2 font-ui" :class="props.disabled && 'opacity-disabled pointer-events-none'">
    <span :id="labelId" class="text-caption font-medium text-foreground">{{ label }}</span>
    <RadioGroupRoot v-model="model" :disabled :aria-labelledby="labelId" class="flex flex-col gap-1.5">
      <label
        v-for="option in options"
        :key="option.value"
        :class="cx(
          'flex cursor-pointer items-start gap-2.5 rounded-medium border border-line bg-surface-raised p-3 transition-colors tempo-instant ease-settle',
          'has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-accent/5',
          option.disabled && 'opacity-disabled pointer-events-none',
        )"
      >
        <RadioGroupItem
          :value="option.value"
          :disabled="option.disabled"
          class="dof-interactive mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-line bg-surface-raised transition-colors tempo-instant ease-settle focus-visible:focus-ring data-[state=checked]:border-accent"
        >
          <RadioGroupIndicator class="block size-2.5 rounded-full bg-accent" />
        </RadioGroupItem>
        <span class="flex flex-col gap-0.5">
          <span class="text-body text-foreground">{{ option.label }}</span>
          <span v-if="option.description" class="text-caption text-muted-foreground">{{ option.description }}</span>
        </span>
      </label>
    </RadioGroupRoot>
  </div>
</template>
