<script setup lang="ts">
/**
 * DofLoadingState — the blessed rendering of useLoadingStage (honesty about time,
 * Bible §6.3): nothing under 400ms, the caller's structure-true skeleton next, and
 * narrated work past 3s. Content renders the default slot once settled.
 */
import type { LoadingStage } from '../composables/use-loading-stage'
import DofText from '../../primitives/dof-text.vue'
import DofSkeleton from '../../primitives/dof-skeleton.vue'

withDefaults(defineProps<{
  stage: LoadingStage
  /** Live narration from useLoadingStage (rendered politely at the narrated stage). */
  narration?: string
}>(), { narration: '' })
</script>

<template>
  <div v-if="stage === 'idle'" class="contents">
    <slot />
  </div>
  <template v-else-if="stage === 'quiet'" />
  <div v-else class="flex flex-col gap-2">
    <slot name="skeleton">
      <DofSkeleton shape="text" :lines="3" />
    </slot>
    <DofText
      v-if="stage === 'narrated'"
      role="caption"
      tone="muted"
      as="p"
      aria-live="polite"
    >
      {{ narration }}
    </DofText>
  </div>
</template>
