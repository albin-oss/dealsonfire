<script setup lang="ts">
/**
 * DofProgress — determinate progress with the words first (Bible §4.3: sentences
 * before charts): "4 of 6 packed" leads, the bar illustrates. Indeterminate work
 * uses useLoadingStage narration, not a spinner bar — so there is no indeterminate
 * mode here, on purpose.
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  value: number
  max: number
  /** The words: "4 of 6 packed". Required — a bar without words is a chart at Glance. */
  label: string
  /** Visually hide the words when the surrounding context already states them. */
  labelHidden?: boolean
}>(), { labelHidden: false })

const percent = computed(() => Math.min(100, Math.max(0, (props.value / Math.max(1, props.max)) * 100)))
</script>

<template>
  <div class="flex w-full flex-col gap-1.5 font-ui">
    <span class="text-caption text-muted-foreground" :class="labelHidden && 'sr-only'">{{ label }}</span>
    <div
      role="progressbar"
      :aria-valuenow="value"
      :aria-valuemin="0"
      :aria-valuemax="max"
      :aria-label="label"
      class="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
    >
      <div
        class="h-full rounded-full bg-accent transition-[width] tempo-quick ease-settle"
        :style="{ width: `${percent}%` }"
      />
    </div>
  </div>
</template>
