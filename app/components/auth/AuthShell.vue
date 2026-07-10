<script setup lang="ts">
/** Shared auth-page frame (WP-R1-B1): centered card, DOF mark, warm and calm. */
import { DofText, DofIcon } from '@ds/index'
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <main class="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface px-4 py-12" data-scope="workspace">
    <div class="flex w-full max-w-sm flex-col gap-6">
      <div class="flex flex-col items-center gap-1 text-center">
        <DofIcon name="flame" size="lg" class="text-ember" />
        <DofText role="headline" as="h1">{{ title }}</DofText>
        <DofText v-if="subtitle" role="body" tone="muted">{{ subtitle }}</DofText>
      </div>
      <div class="flex flex-col gap-4 rounded-large border border-line bg-surface-raised p-6 shadow-raised">
        <slot />
      </div>
      <div class="text-center">
        <slot name="footer" />
      </div>
    </div>
  </main>
</template>
