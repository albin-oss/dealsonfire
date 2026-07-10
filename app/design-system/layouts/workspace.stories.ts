/** DofWorkspaceLayout — S0 five nouns and the S2+ overflow behavior. */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h, ref } from 'vue'
import DofWorkspaceLayout, { type WorkspaceNavItem } from './dof-workspace-layout.vue'
import DofText from '../primitives/dof-text.vue'
import DofAvatar from '../primitives/dof-avatar.vue'
import DofCard from '../primitives/dof-card.vue'

const meta: Meta = { title: 'Layouts/Workspace', parameters: { layout: 'fullscreen' } }
export default meta

const S0_ITEMS: WorkspaceNavItem[] = [
  { id: 'pulse', label: 'Pulse', icon: 'sparkles' },
  { id: 'catalog', label: 'Catalog', icon: 'package' },
  { id: 'offers', label: 'Offers', icon: 'flame' },
  { id: 'orders', label: 'Orders', icon: 'shopping-bag' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

const S2_ITEMS: WorkspaceNavItem[] = [
  ...S0_ITEMS.slice(0, 4),
  { id: 'people', label: 'People', icon: 'users' },
  { id: 'insights', label: 'Insights', icon: 'trending-up' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

function workspace(items: WorkspaceNavItem[]) {
  const active = ref(items[0]!.id)
  return () =>
    h(DofWorkspaceLayout, {
      items,
      activeId: active.value,
      label: 'Grandma Soaps workspace',
      onNavigate: (id: string) => (active.value = id),
    }, {
      brand: () => h('div', { class: 'flex items-center gap-2' }, [
        h(DofAvatar, { name: 'Grandma Soaps', size: 'sm', shape: 'square' }),
        h(DofText, { role: 'emphasis', as: 'span' }, () => 'Grandma Soaps'),
      ]),
      header: () => h(DofText, { role: 'caption', tone: 'muted' }, () => 'header slot (ask bar arrives with UI-COM)'),
      default: () => h('div', { class: 'flex flex-col gap-4 p-4' }, [
        h(DofText, { role: 'headline' }, () => active.value),
        h(DofCard, null, { default: () => h(DofText, { tone: 'muted' }, () => 'Main content area.') }),
      ]),
    })
}

export const FiveNouns: StoryObj = { render: () => workspace(S0_ITEMS) }
export const SevenNounsOverflow: StoryObj = {
  render: () => workspace(S2_ITEMS),
}
