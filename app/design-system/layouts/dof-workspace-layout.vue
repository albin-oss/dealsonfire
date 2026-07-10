<script setup lang="ts">
/**
 * DofWorkspaceLayout — the merchant workspace shell (DESIGN-SYSTEM-001 §4/§5).
 * Nav is DATA (a NavSchema the app derives from capability + Surface Level gating);
 * order is fixed — items appear and retreat, never reorder (ADR-001 §11). Postures:
 * sidebar at regular+, bottom tab bar on compact (≤5 slots; overflow opens a sheet —
 * the noun budget is visible, not silently violated). Skip link + landmark roles.
 */
import { computed, ref } from 'vue'
import { cx } from '../utils/cx'
import type { IconName } from '../icons/icons.generated'
import DofIcon from '../primitives/dof-icon.vue'
import DofSheet from '../primitives/dof-sheet.vue'
import { useDsMessages } from '../i18n'

export interface WorkspaceNavItem {
  id: string
  label: string
  icon: IconName
}

const props = defineProps<{
  items: WorkspaceNavItem[]
  activeId: string
  /** Workspace title for assistive tech (e.g. the store name). */
  label: string
}>()

const emit = defineEmits<{ navigate: [id: string] }>()
const messages = useDsMessages()

const TAB_SLOTS = 5
const tabItems = computed(() => (props.items.length <= TAB_SLOTS ? props.items : props.items.slice(0, TAB_SLOTS - 1)))
const overflowItems = computed(() => (props.items.length <= TAB_SLOTS ? [] : props.items.slice(TAB_SLOTS - 1)))
const overflowOpen = ref(false)

function go(id: string) {
  overflowOpen.value = false
  emit('navigate', id)
}

const itemClass = (active: boolean) => cx(
  'dof-interactive flex items-center gap-3 rounded-medium px-3 py-2 font-ui text-body transition-colors tempo-instant ease-settle focus-visible:focus-ring',
  active ? 'bg-surface-sunken font-medium text-foreground' : 'text-muted-foreground hover:bg-surface-sunken/60',
)
</script>

<template>
  <div class="flex min-h-screen flex-col bg-surface regular:flex-row">
    <a
      href="#dof-main"
      class="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:layer-toast focus:rounded-medium focus:bg-surface-raised focus:px-4 focus:py-2 focus:font-ui focus:text-body focus:text-foreground focus:shadow-overlay focus:focus-ring"
    >
      {{ messages.nav.skipToContent }}
    </a>

    <!-- sidebar (regular+) -->
    <nav :aria-label="label" class="hidden w-60 shrink-0 flex-col gap-1 border-e border-line p-3 regular:flex">
      <div v-if="$slots.brand" class="px-3 pb-3">
        <slot name="brand" />
      </div>
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        :class="itemClass(item.id === activeId)"
        :aria-current="item.id === activeId ? 'page' : undefined"
        @click="go(item.id)"
      >
        <DofIcon :name="item.icon" size="sm" />
        {{ item.label }}
      </button>
      <div v-if="$slots.rail" class="mt-auto pt-3">
        <slot name="rail" />
      </div>
    </nav>

    <div class="flex min-w-0 flex-1 flex-col">
      <header v-if="$slots.header" class="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <slot name="header" />
      </header>
      <main id="dof-main" class="flex min-w-0 flex-1 flex-col pb-20 regular:pb-0" tabindex="-1">
        <slot />
      </main>
    </div>

    <!-- tab bar (compact) -->
    <nav
      :aria-label="label"
      class="fixed inset-x-0 bottom-0 layer-sticky flex items-stretch justify-around border-t border-line bg-surface-raised regular:hidden"
    >
      <button
        v-for="item in tabItems"
        :key="item.id"
        type="button"
        class="dof-interactive flex flex-1 flex-col items-center gap-0.5 py-2 font-ui text-caption transition-colors tempo-instant ease-settle focus-visible:focus-ring"
        :class="item.id === activeId ? 'text-foreground' : 'text-muted-foreground'"
        :aria-current="item.id === activeId ? 'page' : undefined"
        @click="go(item.id)"
      >
        <DofIcon :name="item.icon" size="sm" />
        {{ item.label }}
      </button>
      <button
        v-if="overflowItems.length > 0"
        type="button"
        class="dof-interactive flex flex-1 flex-col items-center gap-0.5 py-2 font-ui text-caption text-muted-foreground focus-visible:focus-ring"
        :aria-expanded="overflowOpen"
        @click="overflowOpen = true"
      >
        <DofIcon name="ellipsis" size="sm" />
        {{ messages.nav.more }}
      </button>
    </nav>

    <DofSheet v-model:open="overflowOpen" :title="messages.nav.more">
      <div class="flex flex-col gap-1">
        <button
          v-for="item in overflowItems"
          :key="item.id"
          type="button"
          :class="itemClass(item.id === activeId)"
          :aria-current="item.id === activeId ? 'page' : undefined"
          @click="go(item.id)"
        >
          <DofIcon :name="item.icon" size="sm" />
          {{ item.label }}
        </button>
      </div>
    </DofSheet>
  </div>
</template>
