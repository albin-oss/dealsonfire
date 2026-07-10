<script setup lang="ts">
/**
 * DofSwitch — immediate-effect toggle (a switch that needs a Save button should be a
 * checkbox). R0/R1 semantics by convention: flipping applies, undo is the safety net.
 */
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import { useId } from 'vue'
import { cx } from '../utils/cx'

const model = defineModel<boolean>({ default: false })

const props = withDefaults(defineProps<{
  label: string
  description?: string
  disabled?: boolean
}>(), { disabled: false })

const id = useId()
const descriptionId = useId()
</script>

<template>
  <div :class="cx('flex items-start justify-between gap-4 font-ui', props.disabled && 'opacity-disabled pointer-events-none')">
    <div class="flex flex-col gap-0.5">
      <label :for="id" class="text-body text-foreground select-none">{{ label }}</label>
      <span v-if="description" :id="descriptionId" class="text-caption text-muted-foreground">{{ description }}</span>
    </div>
    <SwitchRoot
      :id="id"
      v-model="model"
      :disabled
      :aria-describedby="description ? descriptionId : undefined"
      class="dof-interactive relative h-6 w-10 shrink-0 rounded-full bg-line transition-colors tempo-quick ease-settle focus-visible:focus-ring data-[state=checked]:bg-accent"
    >
      <SwitchThumb class="block size-5 translate-x-0.5 rounded-full bg-surface-raised shadow-raised transition-transform tempo-quick ease-settle data-[state=checked]:translate-x-4.5 rtl:-translate-x-0.5 rtl:data-[state=checked]:-translate-x-4.5" />
    </SwitchRoot>
  </div>
</template>
