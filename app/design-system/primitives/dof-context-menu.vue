<script setup lang="ts">
/**
 * DofContextMenu — right-click/long-press menu over any surface. Same MenuItem data
 * contract and dress rules as DofDropdown; gestures duplicate visible affordances,
 * never replace them (Grandma Test) — every context action must exist somewhere visible.
 */
import {
  ContextMenuRoot, ContextMenuTrigger, ContextMenuPortal,
  ContextMenuContent, ContextMenuItem, ContextMenuSeparator,
} from 'reka-ui'
import { computed } from 'vue'
import type { MenuItem } from './dof-dropdown.vue'
import { cx } from '../utils/cx'
import DofIcon from './dof-icon.vue'

const props = defineProps<{
  items: MenuItem[]
}>()

const emit = defineEmits<{ select: [id: string] }>()

const routine = computed(() => props.items.filter((i) => !i.critical))
const critical = computed(() => props.items.filter((i) => i.critical))

const itemClass = (isCritical: boolean) => cx(
  'flex cursor-pointer items-center gap-2 rounded-small px-2.5 py-2 font-ui text-body outline-none',
  'data-disabled:opacity-disabled data-disabled:pointer-events-none',
  isCritical ? 'text-critical data-highlighted:bg-critical/10' : 'text-foreground data-highlighted:bg-surface-sunken',
)
</script>

<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent class="layer-overlay min-w-48 rounded-medium border border-line bg-surface-raised p-1 font-ui shadow-overlay">
        <ContextMenuItem
          v-for="item in routine"
          :key="item.id"
          :disabled="item.disabled"
          :class="itemClass(false)"
          @select="emit('select', item.id)"
        >
          <DofIcon v-if="item.icon" :name="item.icon" size="sm" />
          {{ item.label }}
        </ContextMenuItem>
        <template v-if="critical.length > 0">
          <ContextMenuSeparator class="my-1 h-px bg-line" />
          <ContextMenuItem
            v-for="item in critical"
            :key="item.id"
            :disabled="item.disabled"
            :class="itemClass(true)"
            @select="emit('select', item.id)"
          >
            <DofIcon v-if="item.icon" :name="item.icon" size="sm" />
            {{ item.label }}
          </ContextMenuItem>
        </template>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>
