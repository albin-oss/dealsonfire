/** Specialized inputs — password, search, number, money (minor-units contract), email. */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { expect, userEvent, within } from 'storybook/test'
import { h, ref } from 'vue'
import DofPasswordInput from './dof-password-input.vue'
import DofSearchInput from './dof-search-input.vue'
import DofNumberInput from './dof-number-input.vue'
import DofMoneyInput from './dof-money-input.vue'
import DofEmailInput from './dof-email-input.vue'
import DofInput from './dof-input.vue'
import DofIcon from './dof-icon.vue'
import DofText from './dof-text.vue'

const meta: Meta = { title: 'Primitives/Specialized Inputs' }
export default meta

export const PasswordAndEmail: StoryObj = {
  render: () => {
    const password = ref('hunter2!')
    const email = ref('')
    return () =>
      h('div', { class: 'flex w-96 flex-col gap-5' }, [
        h(DofPasswordInput, { label: 'Password', modelValue: password.value, 'onUpdate:modelValue': (v: string) => (password.value = v) }),
        h(DofEmailInput, { label: 'Email', placeholder: 'rosa@example.com', modelValue: email.value, 'onUpdate:modelValue': (v: string) => (email.value = v) }),
        h(DofInput, { label: 'With prefix/suffix slots', modelValue: 'grandma-soaps' }, {
          prefix: () => h('span', { class: 'text-caption' }, 'dof.dev/'),
          suffix: () => h(DofIcon, { name: 'badge-check', size: 'sm', class: 'text-positive' }),
        }),
      ])
  },
}

export const Search: StoryObj = {
  render: () => {
    const query = ref('')
    return () =>
      h('div', { class: 'flex w-96 flex-col gap-3' }, [
        h(DofSearchInput, { label: 'Search products', placeholder: 'Search products…', modelValue: query.value, 'onUpdate:modelValue': (v: string) => (query.value = v) }),
        h(DofSearchInput, { label: 'Searching', placeholder: 'In flight…', modelValue: 'soap', loading: true }),
      ])
  },
}

export const NumberAndMoney: StoryObj = {
  render: () => {
    const quantity = ref<number | null>(3)
    const price = ref<number | null>(1499)
    const yen = ref<number | null>(5800)
    return () =>
      h('div', { class: 'flex w-96 flex-col gap-5' }, [
        h(DofNumberInput, { label: 'Quantity', min: 0, max: 99, integer: true, modelValue: quantity.value, 'onUpdate:modelValue': (v: number | null) => (quantity.value = v) }),
        h(DofMoneyInput, { label: 'Price', currency: 'EUR', description: 'You type euros; the platform stores integer cents.', modelValue: price.value, 'onUpdate:modelValue': (v: number | null) => (price.value = v) }),
        h(DofMoneyInput, { label: 'Price (JPY — zero-decimal)', currency: 'JPY', modelValue: yen.value, 'onUpdate:modelValue': (v: number | null) => (yen.value = v) }),
        h(DofText, { role: 'caption', tone: 'faint' }, () => `models: quantity=${quantity.value} · EUR minor=${price.value} · JPY minor=${yen.value}`),
      ])
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const price = canvas.getByLabelText('Price')
    await userEvent.clear(price)
    await userEvent.type(price, '32,50')
    await userEvent.tab()
    await expect(canvas.getByText(/EUR minor=3250/)).toBeVisible()
    await expect(price).toHaveValue('32.50') // blur normalizes the display
  },
}
