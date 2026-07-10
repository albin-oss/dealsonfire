<script setup lang="ts">
/**
 * DofSkeleton — structure-true placeholders only (UX-BIBLE §6.3: skeletons never lie
 * about layout). Compose shapes to mirror the real content; used by useLoadingStage
 * between 400ms and 3s. Quiet pulse; reduced-motion renders static.
 */
import { computed } from 'vue'
import { cx } from '../utils/cx'

const props = withDefaults(defineProps<{
  shape?: 'text' | 'rect' | 'circle'
  /** Text lines to render (shape="text"). */
  lines?: number
}>(), { shape: 'rect', lines: 1 })

const base = 'bg-surface-sunken opacity-hint motion-safe:animate-pulse'
const shapeClass = computed(() => cx(
  base,
  props.shape === 'circle' ? 'rounded-full' : 'rounded-small',
))
</script>

<template>
  <div v-if="shape === 'text'" aria-hidden="true" class="space-y-2">
    <div
      v-for="line in lines"
      :key="line"
      :class="cx(base, 'h-[1em] rounded-small', line === lines && lines > 1 && 'w-4/5')"
    />
  </div>
  <div v-else aria-hidden="true" :class="shapeClass" />
</template>
