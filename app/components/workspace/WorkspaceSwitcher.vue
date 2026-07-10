<script setup lang="ts">
/**
 * Workspace switcher (brand slot): shows the active workspace; more workspaces join
 * when merchant sessions reach the client (no fake business data — the single
 * generic workspace is chrome, not data). The store-switcher law: appears as a
 * SWITCHER only when >1 exists (ADR-001 §11).
 */
import { DofAvatar, DofText, DofDropdown, DofIcon, type MenuItem } from '@ds/index'

const props = withDefaults(defineProps<{
  workspaces?: Array<{ id: string; name: string }>
  activeId?: string
}>(), { workspaces: () => [{ id: 'default', name: 'My workspace' }], activeId: 'default' })

const emit = defineEmits<{ switch: [id: string] }>()

const active = () => props.workspaces.find((w) => w.id === props.activeId) ?? props.workspaces[0]!
const items = (): MenuItem[] => props.workspaces.map((w) => ({ id: w.id, label: w.name, icon: 'store' as const }))
</script>

<template>
  <!-- single workspace: a calm identity mark, not a control -->
  <div v-if="workspaces.length <= 1" class="flex items-center gap-2 py-1">
    <DofAvatar :name="active().name" size="sm" shape="square" />
    <DofText role="emphasis" as="span">{{ active().name }}</DofText>
  </div>
  <DofDropdown v-else :items="items()" align="start" @select="emit('switch', $event)">
    <button
      type="button"
      class="dof-interactive flex w-full items-center gap-2 rounded-medium px-1 py-1 text-start transition-colors tempo-instant ease-settle hover:bg-surface-sunken focus-visible:focus-ring"
      aria-label="Switch workspace"
    >
      <DofAvatar :name="active().name" size="sm" shape="square" />
      <DofText role="emphasis" as="span" class="min-w-0 flex-1 truncate">{{ active().name }}</DofText>
      <DofIcon name="chevron-down" size="sm" class="text-faint-foreground" />
    </button>
  </DofDropdown>
</template>
