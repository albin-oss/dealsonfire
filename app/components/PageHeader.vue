<script setup lang="ts">
/**
 * PageHeader (Increment 01) — one heading rhythm for every merchant page: title,
 * one-line purpose, optional actions on the end. Replaces four hand-rolled variants.
 */
import { DofText } from '@ds/index'

defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <section class="flex flex-wrap items-end justify-between gap-3">
    <div class="flex flex-col gap-1">
      <DofText role="headline" as="h1">{{ title }}</DofText>
      <DofText v-if="subtitle" role="body" tone="muted">{{ subtitle }}</DofText>
      <slot name="meta" />
    </div>
    <div v-if="$slots.actions" class="flex gap-2">
      <slot name="actions" />
    </div>
  </section>
</template>
