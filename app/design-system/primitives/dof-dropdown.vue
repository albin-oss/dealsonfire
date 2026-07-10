<script setup lang="ts">
/**
 * DofDropdown — the action menu (reka DropdownMenu): items are data, destructive
 * items dress critical and sit last (never adjacent to routine actions — §3.2
 * Danger). One overlay layer; full keyboard operability from reka.
 */
import {
  DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuPortal,
  DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from 'reka-ui'
import { computed } from 'vue'
import type { IconName } from '../icons/icons.generated'
import { cx } from '../utils/cx'
import DofIcon from './dof-icon.vue'

export interface MenuItem {
  id: string
  label: string
  icon?: IconName
  disabled?: boolean
  /** Critical items render in danger dress and are grouped last automatically. */
  critical?: boolean
}

const props = withDefaults(defineProps<{
  items: MenuItem[]
  align?: 'start' | 'center' | 'end'
}>(), { align: 'end' })

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
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <slot />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        :align
        :side-offset="4"
        class="layer-overlay min-w-48 rounded-medium border border-line bg-surface-raised p-1 font-ui shadow-overlay"
      >
        <DropdownMenuItem
          v-for="item in routine"
          :key="item.id"
          :disabled="item.disabled"
          :class="itemClass(false)"
          @select="emit('select', item.id)"
        >
          <DofIcon v-if="item.icon" :name="item.icon" size="sm" />
          {{ item.label }}
        </DropdownMenuItem>
        <template v-if="critical.length > 0">
          <DropdownMenuSeparator class="my-1 h-px bg-line" />
          <DropdownMenuItem
            v-for="item in critical"
            :key="item.id"
            :disabled="item.disabled"
            :class="itemClass(true)"
            @select="emit('select', item.id)"
          >
            <DofIcon v-if="item.icon" :name="item.icon" size="sm" />
            {{ item.label }}
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
