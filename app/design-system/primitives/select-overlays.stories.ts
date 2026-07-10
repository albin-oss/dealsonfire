/** DofSelect, DofTooltip, DofPopover — portal/overlay primitives. */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h, ref } from 'vue'
import DofSelect from './dof-select.vue'
import DofTooltip from './dof-tooltip.vue'
import DofPopover from './dof-popover.vue'
import DofButton from './dof-button.vue'
import DofText from './dof-text.vue'

const meta: Meta = { title: 'Primitives/Overlays' }
export default meta

export const Select: StoryObj = {
  render: () => {
    const value = ref<string>()
    return () =>
      h('div', { class: 'flex w-96 flex-col gap-5' }, [
        h(DofSelect, {
          label: 'Fulfillment kind',
          placeholder: 'What kind of thing is this?',
          modelValue: value.value,
          'onUpdate:modelValue': (v?: string) => (value.value = v),
          items: [
            { value: 'physical', label: 'Physical — I ship it' },
            { value: 'digital', label: 'Digital — a download' },
            { value: 'service', label: 'Service — I do it' },
            { value: 'legacy', label: 'Unavailable option', disabled: true },
          ],
        }),
        h(DofSelect, {
          label: 'Category',
          items: [{ value: 'soap', label: 'Home / Soap' }],
          error: 'Pick a category so customers can find this product.',
        }),
      ])
  },
}

export const Tooltip: StoryObj = {
  render: () => () =>
    h('div', { class: 'flex justify-center p-8' }, [
      h(DofTooltip, { text: 'Readiness: what is left before customers can buy this.' }, () =>
        h(DofButton, { variant: 'soft', tone: 'neutral', icon: 'circle-help' }, () => 'Readiness')),
    ]),
}

export const Popover: StoryObj = {
  render: () => () =>
    h('div', { class: 'flex justify-center p-8' }, [
      h(DofPopover, null, {
        trigger: () => h(DofButton, { variant: 'outline', tone: 'neutral', icon: 'sliders-horizontal' }, () => 'Filters'),
        default: () =>
          h('div', { class: 'flex flex-col gap-2' }, [
            h(DofText, { role: 'emphasis' }, () => 'Filter products'),
            h(DofText, { role: 'body', tone: 'muted' }, () => 'Filters persist in the URL — shareable and back-safe.'),
          ]),
      }),
    ]),
}
