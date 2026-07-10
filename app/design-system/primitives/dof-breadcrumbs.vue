<script setup lang="ts">
/**
 * DofBreadcrumbs — location trail (rare by design: ≤3 moves from Pulse means depth
 * is shallow; breadcrumbs appear only where a real hierarchy exists). Last item is
 * the current page (aria-current), earlier items navigate.
 */
import DofIcon from './dof-icon.vue'

export interface Crumb {
  id: string
  label: string
}

defineProps<{
  items: Crumb[]
}>()

const emit = defineEmits<{ navigate: [id: string] }>()
</script>

<template>
  <nav aria-label="breadcrumb" class="font-ui">
    <ol class="flex flex-wrap items-center gap-1 text-caption">
      <li v-for="(item, index) in items" :key="item.id" class="flex items-center gap-1">
        <button
          v-if="index < items.length - 1"
          type="button"
          class="dof-interactive rounded-small px-1 py-0.5 text-muted-foreground transition-colors tempo-instant ease-settle hover:text-foreground focus-visible:focus-ring"
          @click="emit('navigate', item.id)"
        >
          {{ item.label }}
        </button>
        <span v-else class="px-1 py-0.5 text-foreground" aria-current="page">{{ item.label }}</span>
        <DofIcon v-if="index < items.length - 1" name="chevron-right" size="sm" class="size-3.5 text-faint-foreground rtl:rotate-180" />
      </li>
    </ol>
  </nav>
</template>
