<script setup lang="ts">
/** DofCheckbox — reka-ui Checkbox with label baked in (a checkbox without a label is a defect). */
import { CheckboxRoot, CheckboxIndicator } from 'reka-ui'
import { useId } from 'vue'
import { cx } from '../utils/cx'
import DofIcon from './dof-icon.vue'

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
  <div :class="cx('flex items-start gap-2.5 font-ui', props.disabled && 'opacity-disabled pointer-events-none')">
    <CheckboxRoot
      :id="id"
      v-model="model"
      :disabled
      :aria-describedby="description ? descriptionId : undefined"
      class="dof-interactive mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-small border border-line bg-surface-raised transition-colors tempo-instant ease-settle focus-visible:focus-ring data-[state=checked]:border-accent data-[state=checked]:bg-accent"
    >
      <CheckboxIndicator class="text-on-accent">
        <DofIcon name="check" size="sm" />
      </CheckboxIndicator>
    </CheckboxRoot>
    <div class="flex flex-col gap-0.5">
      <label :for="id" class="text-body text-foreground select-none">{{ label }}</label>
      <span v-if="description" :id="descriptionId" class="text-caption text-muted-foreground">{{ description }}</span>
    </div>
  </div>
</template>
