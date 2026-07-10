/** Field primitives — DofInput, DofTextarea with the full field chrome states. */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h, ref } from 'vue'
import DofInput from './dof-input.vue'
import DofTextarea from './dof-textarea.vue'

const meta: Meta = { title: 'Primitives/Fields' }
export default meta

export const Inputs: StoryObj = {
  render: () => {
    const title = ref('Lavender Soap')
    const sku = ref('')
    return () =>
      h('div', { class: 'flex w-96 flex-col gap-5' }, [
        h(DofInput, {
          label: 'Product title',
          modelValue: title.value,
          'onUpdate:modelValue': (v: string) => (title.value = v),
          description: 'Shown to customers on your store.',
        }),
        h(DofInput, {
          label: 'SKU',
          modelValue: sku.value,
          'onUpdate:modelValue': (v: string) => (sku.value = v),
          error: 'SKU "SOAP-001" is already used by another product — choose a different SKU, or leave it blank to auto-generate one.',
        }),
        h(DofInput, { label: 'Store handle', modelValue: 'grandma-soaps', disabled: true }),
        h(DofInput, { label: 'Search', type: 'search', labelHidden: true, placeholder: 'Search products…', modelValue: '' }),
      ])
  },
}

export const Textareas: StoryObj = {
  render: () => {
    const text = ref('Hand made with lavender from our garden.')
    return () =>
      h('div', { class: 'flex w-96 flex-col gap-5' }, [
        h(DofTextarea, {
          label: 'Description',
          modelValue: text.value,
          'onUpdate:modelValue': (v: string) => (text.value = v),
          description: 'Plain language sells — say what it is and who it is for.',
        }),
        h(DofTextarea, { label: 'Notes', modelValue: '', error: 'Add at least one sentence so customers know what to expect.' }),
      ])
  },
}
