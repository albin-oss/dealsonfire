<script setup lang="ts">
/**
 * The Merchant Workspace shell (UI-COM-001): DofWorkspaceLayout + top bar + ask bar
 * (mod+k) + notification center + toast/undo regions + announcer. Nav renders from
 * the NavSchema at the current Surface Level; every module registers a "Go to"
 * command in the one registry (DS-8).
 */
import { computed, ref, watch } from 'vue'
import {
  DofWorkspaceLayout, DofAskBar, DofToastRegion, DofAnnouncer,
  registerCommands, useShortcuts, useDsMessages, type Crumb,
} from '@ds/index'
import { WORKSPACE_MODULES, modulesForSurface, moduleByPath, useSurfaceLevel, type SurfaceLevel } from '../composables/workspace-nav'
import { contextualFifthId } from '../composables/workspace-companion'
import type { OnboardingProgressResponse } from '@contracts/schemas/merchant/onboarding.schema'
import { devUserId } from '../composables/ignite/launch'
import WorkspaceTopBar from '../components/workspace/WorkspaceTopBar.vue'
import WorkspaceSwitcher from '../components/workspace/WorkspaceSwitcher.vue'
import NotificationCenter from '../components/workspace/NotificationCenter.vue'

const route = useRoute()
const router = useRouter()
const messages = useDsMessages()
const { level } = useSurfaceLevel()

const navItems = computed(() => modulesForSurface(level.value).map(({ id, label, icon }) => ({ id, label, icon })))
const activeId = computed(() => moduleByPath(route.path)?.id ?? 'home')

// Contextual mobile fifth slot (UX-WORKSPACE-001 §7). Nuxt dedupes this read with the
// Home's by key — one request feeds the hero, the journey, and the tab bar.
const devHeaders = { 'x-dof-user-id': import.meta.client ? devUserId() : '' }
const { data: progress } = useFetch<OnboardingProgressResponse>('/api/v1/workspace/progress', {
  lazy: true,
  server: false,
  headers: devHeaders,
})

// the shell knows WHOSE workspace this is — the header wears the store's name
const { data: workspaceData } = useFetch<{ businesses: Array<{ business_id: string; display_name: string; stores: Array<{ store_id: string; handle: string; name: string }> }> }>('/api/v1/workspace', {
  lazy: true, server: false, headers: devHeaders,
})
const activeBusiness = computed(() => workspaceData.value?.businesses[0] ?? null)
const workspaces = computed(() => (activeBusiness.value
  ? [{ id: activeBusiness.value.business_id, name: activeBusiness.value.stores[0]?.name ?? activeBusiness.value.display_name }]
  : [{ id: 'default', name: 'My workspace' }]))
const storeHandle = computed(() => activeBusiness.value?.stores[0]?.handle ?? null)
const contextualId = computed(() => contextualFifthId(progress.value ?? null))

function navigate(id: string) {
  const target = WORKSPACE_MODULES.find((m) => m.id === id)
  if (target) void router.push(target.to)
}

const crumbs = computed<Crumb[]>(() => {
  const current = moduleByPath(route.path)
  if (!current || current.id === 'home') return [{ id: 'home', label: 'Home' }]
  return [{ id: 'home', label: 'Home' }, { id: current.id, label: current.label }]
})

// ——— ask bar: one registry, one shortcut, recents persisted locally
const askOpen = ref(false)
const notificationsOpen = ref(false)

// idempotent across layout remounts (HMR): nav commands are this layout's own set
import { listCommands } from '@ds/index'
if (!listCommands().some((c) => c.id === 'bridge.street')) {
  registerCommands([
    {
      id: 'bridge.street', label: 'Today on DOF — the street', group: 'Go to',
      icon: 'flame', keywords: ['home', 'public', 'feed', 'street', 'discover'],
      run: () => { void router.push('/home') },
    },
    {
      id: 'bridge.storefront', label: 'View your store — live', group: 'Go to',
      icon: 'external-link', keywords: ['storefront', 'live', 'public', 'shop'],
      run: () => { if (storeHandle.value) void router.push(`/s/${storeHandle.value}`) },
    },
  ])
}
if (!listCommands().some((c) => c.id === 'nav.home')) {
  registerCommands(WORKSPACE_MODULES.map((m) => ({
    id: `nav.${m.id}`,
    label: `Go to ${m.label}`,
    group: 'Go to',
    icon: m.icon,
    keywords: [m.label, m.id],
    run: () => navigate(m.id),
  })))
}

useShortcuts([
  { combo: 'mod+k', description: messages.palette.open, handler: () => (askOpen.value = !askOpen.value) },
])

const RECENTS_KEY = 'dof.recent-searches'
const recentSearches = ref<string[]>([])
if (import.meta.client) {
  try {
    recentSearches.value = JSON.parse(window.localStorage.getItem(RECENTS_KEY) ?? '[]') as string[]
  } catch { recentSearches.value = [] }
  watch(recentSearches, (value) => window.localStorage.setItem(RECENTS_KEY, JSON.stringify(value.slice(0, 5))))
}
function recordSearch(term: string) {
  recentSearches.value = [term, ...recentSearches.value.filter((t) => t !== term)].slice(0, 5)
}
</script>

<template>
  <DofWorkspaceLayout
    :items="navItems"
    :active-id="activeId"
    :contextual-id="contextualId"
    label="DOF workspace"
    @navigate="navigate"
  >
    <template #brand>
      <WorkspaceSwitcher :workspaces="workspaces" />
    </template>
    <template #header>
      <WorkspaceTopBar
        :crumbs="crumbs"
        :surface-level="level"
        @navigate="navigate"
        @open-ask-bar="askOpen = true"
        @open-notifications="notificationsOpen = true"
        @set-surface="(l: SurfaceLevel) => (level = l)"
      />
    </template>
    <slot />
  </DofWorkspaceLayout>

  <DofAskBar v-model:open="askOpen" :recent-searches="recentSearches" @search="recordSearch" />
  <NotificationCenter v-model:open="notificationsOpen" />
  <DofToastRegion />
  <DofAnnouncer />
</template>
