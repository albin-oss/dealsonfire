<script setup lang="ts">
/** DofDivider — structural separation; with a label it names the section quietly. */
import { cx } from '../utils/cx'

const props = withDefaults(defineProps<{
  label?: string
  orientation?: 'horizontal' | 'vertical'
}>(), { orientation: 'horizontal' })
</script>

<template>
  <div
    v-if="props.orientation === 'vertical'"
    role="separator"
    aria-orientation="vertical"
    class="self-stretch border-s border-line"
  />
  <div v-else-if="label" role="separator" class="flex items-center gap-3 font-ui">
    <span class="h-px flex-1 bg-line" />
    <span class="text-caption text-faint-foreground">{{ label }}</span>
    <span class="h-px flex-1 bg-line" />
  </div>
  <hr v-else :class="cx('border-line')">
</template>
