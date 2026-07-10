/** Layout shells — feed, catalog, object, settings, run (posture behavior at a glance). */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h, ref } from 'vue'
import DofFeedLayout from './dof-feed-layout.vue'
import DofCatalogLayout from './dof-catalog-layout.vue'
import DofObjectLayout from './dof-object-layout.vue'
import DofSettingsLayout from './dof-settings-layout.vue'
import DofRunShell from './dof-run-shell.vue'
import DofText from '../primitives/dof-text.vue'
import DofButton from '../primitives/dof-button.vue'
import DofBadge from '../primitives/dof-badge.vue'
import DofSkeleton from '../primitives/dof-skeleton.vue'

const meta: Meta = { title: 'Layouts/Shells' }
export default meta

const card = (label: string) =>
  h('div', { class: 'flex flex-col gap-2 rounded-medium border border-line bg-surface-raised p-4 shadow-raised' }, [
    h(DofText, { role: 'emphasis' }, () => label),
    h(DofSkeleton, { shape: 'text', lines: 2 }),
  ])

export const Feed: StoryObj = {
  render: () => () =>
    h(DofFeedLayout, null, {
      default: () => [card('Attention: 2 orders to pack'), card('Opportunity: weekend deal'), card('How you’re doing: quiet Tuesday')],
      rail: () => [card('Context rail (wide posture)')],
    }),
}

export const Catalog: StoryObj = {
  render: () => () =>
    h(DofCatalogLayout, null, {
      toolbar: () => h(DofBadge, { tone: 'neutral' }, () => 'toolbar slot'),
      default: () => Array.from({ length: 8 }, (_, i) => card(`Product ${i + 1}`)),
      more: () => h(DofButton, { variant: 'soft', tone: 'neutral' }, () => 'Load more'),
    }),
}

export const ObjectDetail: StoryObj = {
  render: () => () =>
    h(DofObjectLayout, null, {
      header: () => [h(DofText, { role: 'headline' }, () => 'Lavender Soap'), h(DofBadge, { tone: 'positive' }, () => 'active')],
      actions: () => h(DofButton, { variant: 'outline', tone: 'neutral', icon: 'archive' }, () => 'Archive'),
      default: () => [card('Variants'), card('Media')],
      panel: () => [card('Readiness'), card('History')],
    }),
}

export const Settings: StoryObj = {
  render: () => {
    const active = ref('store')
    return () =>
      h(DofSettingsLayout, {
        sections: [
          { id: 'store', label: 'Store settings' },
          { id: 'business', label: 'Business settings' },
          { id: 'account', label: 'My account' },
        ],
        activeId: active.value,
        onNavigate: (id: string) => (active.value = id),
      }, { default: () => card(`Active: ${active.value}`) })
  },
}

export const Run: StoryObj = {
  render: () => {
    const open = ref(false)
    const packed = ref(0)
    return () =>
      h('div', null, [
        h(DofButton, { tone: 'accent', onClick: () => { open.value = true; packed.value = 0 } }, () => 'Start packing run'),
        h(DofRunShell, {
          open: open.value,
          title: 'Packing 6 orders',
          progress: `${packed.value} of 6 packed`,
          onExit: () => (open.value = false),
        }, {
          default: () => h('div', { class: 'flex flex-col items-start gap-3' }, [
            card('Order card (full context, one-tap action)'),
            h(DofButton, { tone: 'accent', icon: 'check', onClick: () => (packed.value = Math.min(6, packed.value + 1)) }, () => 'Packed'),
          ]),
          footer: () => h(DofText, { role: 'caption', tone: 'faint' }, () => 'Esc or “Save & exit” leaves — progress is kept.'),
        }),
      ])
  },
}
