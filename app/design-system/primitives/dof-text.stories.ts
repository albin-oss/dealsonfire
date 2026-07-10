/** DofText — the type scale and tones (gate evidence for typography tokens). */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h } from 'vue'
import DofText from './dof-text.vue'

const meta: Meta<typeof DofText> = { title: 'Primitives/DofText', component: DofText }
export default meta
type Story = StoryObj<typeof DofText>

export const Scale: Story = {
  render: () => () =>
    h('div', { class: 'flex flex-col gap-2' }, [
      h(DofText, { role: 'display' }, () => 'Display — the Mirror moment'),
      h(DofText, { role: 'headline' }, () => 'Headline — page voice'),
      h(DofText, { role: 'title' }, () => 'Title — section voice'),
      h(DofText, { role: 'emphasis' }, () => 'Emphasis — card lead'),
      h(DofText, { role: 'body' }, () => 'Body — the working sentence, calm and readable at length.'),
      h(DofText, { role: 'caption' }, () => 'Caption — labels and metadata'),
    ]),
}

export const Tones: Story = {
  render: () => () =>
    h('div', { class: 'flex flex-col gap-1' }, [
      h(DofText, { tone: 'default' }, () => 'Default — primary content'),
      h(DofText, { tone: 'muted' }, () => 'Muted — supporting content'),
      h(DofText, { tone: 'faint' }, () => 'Faint — hints and effort labels'),
    ]),
}

export const Reading: Story = {
  render: () => () =>
    h(DofText, { reading: true }, () =>
      'Long-form content gets the reading measure: a comfortable line length that keeps policy text and descriptions humane instead of stretching across the viewport.'),
}
