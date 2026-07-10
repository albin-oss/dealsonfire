<script setup lang="ts">
/**
 * Workspace top bar: breadcrumbs · global search entry (opens the ask bar) ·
 * notification center · user menu with the interface-density (Surface Level)
 * control — the visible face of Progressive Complexity and its de-escalation.
 */
import {
  DofBreadcrumbs, DofIconButton, DofButton, DofDropdown, DofAvatar, DofIcon,
  useDsMessages, type Crumb, type MenuItem,
} from '@ds/index'
import { computed } from 'vue'
import { SURFACE_LEVELS, type SurfaceLevel } from '../../composables/workspace-nav'

defineProps<{
  crumbs: Crumb[]
  surfaceLevel: SurfaceLevel
}>()

const emit = defineEmits<{
  navigate: [id: string]
  openAskBar: []
  openNotifications: []
  setSurface: [level: SurfaceLevel]
}>()

const messages = useDsMessages()

const SURFACE_LABEL: Record<SurfaceLevel, string> = {
  s0: 'Essentials (5 areas)',
  s1: 'Selling',
  s2: 'Operating',
  s3: 'Everything',
}

const { user, logout } = useSession()

const userMenu = computed<MenuItem[]>(() => [
  ...SURFACE_LEVELS.map((level) => ({
    id: `surface:${level}`,
    label: `Show: ${SURFACE_LABEL[level]}`,
    icon: 'sliders-horizontal' as const,
  })),
  { id: 'account', label: 'My account', icon: 'user' as const },
  { id: 'signout', label: 'Sign out', icon: 'external-link' as const },
])

function onUserMenu(id: string) {
  if (id.startsWith('surface:')) emit('setSurface', id.slice('surface:'.length) as SurfaceLevel)
  else if (id === 'signout') void logout()
}
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center justify-between gap-3">
    <DofBreadcrumbs :items="crumbs" @navigate="emit('navigate', $event)" />
    <div class="flex shrink-0 items-center gap-1">
      <DofButton
        variant="outline"
        tone="neutral"
        size="sm"
        icon="search"
        class="hidden regular:inline-flex"
        @click="emit('openAskBar')"
      >
        {{ messages.palette.placeholder }}
        <kbd class="ms-2 rounded-small border border-line px-1.5 text-caption text-faint-foreground">⌘K</kbd>
      </DofButton>
      <DofIconButton icon="search" :label="messages.palette.open" class="regular:hidden" @click="emit('openAskBar')" />
      <DofIconButton icon="info" :label="messages.notifications.open" @click="emit('openNotifications')" />
      <DofDropdown :items="userMenu" @select="onUserMenu">
        <button
          type="button"
          class="dof-interactive flex items-center gap-1 rounded-full p-1 transition-colors tempo-instant ease-settle hover:bg-surface-sunken focus-visible:focus-ring"
          aria-label="User menu"
        >
          <DofAvatar :name="user?.display_name || user?.email || 'My Workspace'" size="sm" />
          <DofIcon name="chevron-down" size="sm" class="text-faint-foreground" />
        </button>
      </DofDropdown>
    </div>
  </div>
</template>
