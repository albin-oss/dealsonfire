<script setup lang="ts">
/**
 * DofCatalogLayout — grid shell for products/collections/marketplace (DESIGN-SYSTEM-001
 * §5). Container-query driven (DS-9): the grid answers to its own width, not the
 * viewport, so it composes into rails and panels unchanged. Toolbar slot carries
 * search/filters; batch bar mounts above content only while a selection is active.
 */
withDefaults(defineProps<{ batchActive?: boolean }>(), { batchActive: false })
</script>

<template>
  <div class="@container flex w-full flex-col gap-4">
    <div v-if="$slots.toolbar" class="flex flex-wrap items-center gap-2">
      <slot name="toolbar" />
    </div>
    <div v-if="batchActive && $slots.batch" class="sticky top-0 layer-sticky rounded-medium border border-line bg-surface-raised p-2 shadow-raised">
      <slot name="batch" />
    </div>
    <div class="grid grid-cols-1 gap-4 @2up:grid-cols-2 @3up:grid-cols-3 @4up:grid-cols-4">
      <slot />
    </div>
    <div v-if="$slots.more" class="flex justify-center py-2">
      <slot name="more" />
    </div>
  </div>
</template>
