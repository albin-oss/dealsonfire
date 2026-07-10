/** Choice primitives — DofCheckbox, DofSwitch, DofRadioGroup. */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h, ref } from 'vue'
import DofCheckbox from './dof-checkbox.vue'
import DofSwitch from './dof-switch.vue'
import DofRadioGroup from './dof-radio-group.vue'

const meta: Meta = { title: 'Primitives/Choices' }
export default meta

export const Checkboxes: StoryObj = {
  render: () => {
    const track = ref(true)
    return () =>
      h('div', { class: 'flex w-96 flex-col gap-4' }, [
        h(DofCheckbox, {
          label: 'Track quantities',
          description: 'DOF warns you before anything oversells.',
          modelValue: track.value,
          'onUpdate:modelValue': (v: boolean) => (track.value = v),
        }),
        h(DofCheckbox, { label: 'Charge tax on this product', modelValue: false }),
        h(DofCheckbox, { label: 'Disabled option', modelValue: false, disabled: true }),
      ])
  },
}

export const Switches: StoryObj = {
  render: () => {
    const open = ref(true)
    return () =>
      h('div', { class: 'flex w-96 flex-col gap-4' }, [
        h(DofSwitch, {
          label: 'Store open',
          description: 'Customers can browse and buy.',
          modelValue: open.value,
          'onUpdate:modelValue': (v: boolean) => (open.value = v),
        }),
        h(DofSwitch, { label: 'Vacation mode', modelValue: false }),
      ])
  },
}

export const Radios: StoryObj = {
  render: () => {
    const choice = ref('flat')
    return () =>
      h('div', { class: 'w-96' }, [
        h(DofRadioGroup, {
          label: 'Who pays shipping?',
          modelValue: choice.value,
          'onUpdate:modelValue': (v?: string) => (choice.value = v ?? 'flat'),
          options: [
            { value: 'flat', label: 'Flat rate — €4.90', description: 'Typical for your category.' },
            { value: 'free-over', label: 'Free over €50', description: 'You cover shipping on bigger orders.' },
            { value: 'customer', label: 'Customer pays exact cost', disabled: false },
          ],
        }),
      ])
  },
}
