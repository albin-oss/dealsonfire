/** DofButton — every variant × tone, sizes, loading, disabled (gate evidence, DS-16). */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h } from 'vue'
import DofButton from './dof-button.vue'
import { TONES, VARIANTS, SIZES } from '../types'

const meta: Meta<typeof DofButton> = {
  title: 'Primitives/DofButton',
  component: DofButton,
  args: { variant: 'solid', tone: 'accent', size: 'md' },
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
    tone: { control: 'select', options: TONES },
    size: { control: 'select', options: SIZES },
  },
}
export default meta
type Story = StoryObj<typeof DofButton>

export const Playground: Story = {
  render: (args) => () => h(DofButton, args, () => 'Save changes'),
}

export const Matrix: Story = {
  render: () => () =>
    h('div', { class: 'flex flex-col gap-3' }, VARIANTS.map((variant) =>
      h('div', { class: 'flex flex-wrap items-center gap-2' }, TONES.map((tone) =>
        h(DofButton, { variant, tone, size: 'sm' }, () => `${variant}/${tone}`)))),
    ),
}

export const Sizes: Story = {
  render: () => () =>
    h('div', { class: 'flex items-center gap-3' }, SIZES.map((size) =>
      h(DofButton, { size, tone: 'accent', icon: 'plus' }, () => `Size ${size}`))),
}

export const States: Story = {
  render: () => () =>
    h('div', { class: 'flex items-center gap-3' }, [
      h(DofButton, { tone: 'accent', loading: true }, () => 'Saving…'),
      h(DofButton, { tone: 'accent', disabled: true }, () => 'Disabled'),
      h(DofButton, { tone: 'critical', variant: 'outline', icon: 'trash-2' }, () => 'Archive'),
      h(DofButton, { tone: 'ember', icon: 'flame' }, () => 'Launch deal'),
    ]),
}
