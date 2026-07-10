<script setup lang="ts">
/**
 * DofObjectLayout — detail shell for one thing (product, order, customer)
 * (DESIGN-SYSTEM-001 §5): header + content, side panel joins at the wide posture.
 * Inline editing lives in the content — this shell never renders a distant form.
 */
</script>

<template>
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-1">
        <slot name="header" />
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <div class="flex flex-col gap-6 wide:flex-row">
      <main class="flex min-w-0 flex-1 flex-col gap-6">
        <slot />
      </main>
      <aside v-if="$slots.panel" class="flex w-full shrink-0 flex-col gap-4 wide:w-80">
        <slot name="panel" />
      </aside>
    </div>
  </div>
</template>
