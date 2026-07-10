/** Display primitives — DofBadge, DofAvatar, DofIcon, DofSkeleton (all states). */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h } from 'vue'
import DofBadge from './dof-badge.vue'
import DofAvatar from './dof-avatar.vue'
import DofIcon from './dof-icon.vue'
import DofSkeleton from './dof-skeleton.vue'
import { TONES } from '../types'
import { ICON_NAMES } from '../icons/icons.generated'

const meta: Meta = { title: 'Primitives/Display' }
export default meta

export const Badges: StoryObj = {
  render: () => () =>
    h('div', { class: 'flex flex-wrap gap-2' }, TONES.map((tone) =>
      h(DofBadge, { tone }, () => tone))),
}

export const Avatars: StoryObj = {
  render: () => () =>
    h('div', { class: 'flex items-center gap-3' }, [
      h(DofAvatar, { name: 'Rosa Martinez', size: 'sm' }),
      h(DofAvatar, { name: 'Rosa Martinez', size: 'md' }),
      h(DofAvatar, { name: 'Grandma Soaps', size: 'lg', shape: 'square' }),
      h(DofAvatar, { name: 'Broken Image', src: 'data:,x', size: 'md' }),
    ]),
}

export const Icons: StoryObj = {
  render: () => () =>
    h('div', { class: 'flex flex-wrap gap-3 text-muted-foreground' }, ICON_NAMES.map((name) =>
      h('span', { class: 'flex flex-col items-center gap-1 w-16' }, [
        h(DofIcon, { name }),
        h('span', { class: 'text-caption text-faint-foreground' }, name),
      ]))),
}

export const Skeletons: StoryObj = {
  render: () => () =>
    h('div', { class: 'flex w-72 flex-col gap-3' }, [
      h('div', { class: 'flex items-center gap-3' }, [
        h(DofSkeleton, { shape: 'circle', class: 'size-9' }),
        h('div', { class: 'flex-1' }, [h(DofSkeleton, { shape: 'text', lines: 2 })]),
      ]),
      h(DofSkeleton, { shape: 'rect', class: 'h-24 w-full' }),
    ]),
}
