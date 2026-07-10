<script setup lang="ts">
/**
 * DofFeedLayout — the Pulse/Community shell (DESIGN-SYSTEM-001 §5): one calm card
 * stream; a context rail appears at the wide posture. Card order is the caller's —
 * attention → opportunities → how-you're-doing is Pulse law, enforced by content.
 */
</script>

<template>
  <div class="mx-auto flex w-full max-w-6xl gap-8 px-4 py-6">
    <!-- a region, not <main>: the page-level main landmark belongs to the app shell -->
    <section class="flex min-w-0 flex-1 flex-col gap-4" aria-label="feed">
      <slot />
    </section>
    <aside v-if="$slots.rail" class="hidden w-72 shrink-0 flex-col gap-4 wide:flex">
      <slot name="rail" />
    </aside>
  </div>
</template>
