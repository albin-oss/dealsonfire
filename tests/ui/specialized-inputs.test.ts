/** Specialized inputs — the DofMoneyInput minor-units contract above all (DS-10). */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DofMoneyInput from '@ds/primitives/dof-money-input.vue'
import DofNumberInput from '@ds/primitives/dof-number-input.vue'
import DofSearchInput from '@ds/primitives/dof-search-input.vue'
import DofPasswordInput from '@ds/primitives/dof-password-input.vue'
import DofChip from '@ds/primitives/dof-chip.vue'
import DofProgress from '@ds/primitives/dof-progress.vue'
import DofIconButton from '@ds/primitives/dof-icon-button.vue'

async function typeAndBlur(wrapper: ReturnType<typeof mount>, text: string) {
  const input = wrapper.get('input')
  await input.setValue(text)
  await input.trigger('blur')
}

describe('DofMoneyInput (integer minor units, always)', () => {
  it('typed major units emit integer minor units; blur normalizes the display', async () => {
    const wrapper = mount(DofMoneyInput, { props: { label: 'Price', currency: 'EUR', modelValue: null } })
    await typeAndBlur(wrapper, '32,50')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([3250])
    expect(wrapper.get('input').element.value).toBe('32.50')
  })

  it('zero-decimal currencies use exponent 0', async () => {
    const wrapper = mount(DofMoneyInput, { props: { label: 'Price', currency: 'JPY', modelValue: null } })
    await typeAndBlur(wrapper, '5800')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([5800])
  })

  it('rounds sub-minor precision instead of emitting fractions', async () => {
    const wrapper = mount(DofMoneyInput, { props: { label: 'Price', currency: 'EUR', modelValue: null } })
    await typeAndBlur(wrapper, '0.999')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([100])
  })

  it('unparseable text keeps the field, emits null, and educates', async () => {
    const wrapper = mount(DofMoneyInput, { props: { label: 'Price', currency: 'EUR', modelValue: 1499 } })
    await typeAndBlur(wrapper, 'about twenty')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null])
    expect(wrapper.get('input').element.value).toBe('about twenty') // work is never lost
    expect(wrapper.text()).toContain('Enter a price like 14.99')
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
  })

  it('renders the incoming model as major units with the currency prefix', () => {
    const wrapper = mount(DofMoneyInput, { props: { label: 'Price', currency: 'EUR', modelValue: 124000 } })
    expect(wrapper.get('input').element.value).toBe('1240.00')
    expect(wrapper.text()).toContain('€')
  })
})

describe('DofNumberInput', () => {
  it('parses, clamps, and steps with arrow keys', async () => {
    const wrapper = mount(DofNumberInput, { props: { label: 'Qty', min: 0, max: 10, integer: true, modelValue: 5 } })
    const input = wrapper.get('input')

    await typeAndBlur(wrapper, '99')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([10]) // clamped

    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([9])

    await typeAndBlur(wrapper, '3.7')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([3]) // integer mode truncates

    await typeAndBlur(wrapper, '')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null]) // empty is honest
  })

  it('stepper buttons carry spoken labels', () => {
    const wrapper = mount(DofNumberInput, { props: { label: 'Qty', modelValue: 1 } })
    expect(wrapper.find('button[aria-label="Increase"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Decrease"]').exists()).toBe(true)
  })
})

describe('DofSearchInput / DofPasswordInput', () => {
  it('search clears via button and Escape', async () => {
    const wrapper = mount(DofSearchInput, { props: { label: 'Search', modelValue: 'soap' } })
    await wrapper.get('button[aria-label="Clear search"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
  })

  it('password toggles visibility with aria-pressed', async () => {
    const wrapper = mount(DofPasswordInput, { props: { label: 'Password', modelValue: 'x' } })
    expect(wrapper.get('input').attributes('type')).toBe('password')
    const toggle = wrapper.get('button[aria-label="Show password"]')
    await toggle.trigger('click')
    expect(wrapper.get('input').attributes('type')).toBe('text')
    expect(wrapper.get('button[aria-label="Hide password"]').attributes('aria-pressed')).toBe('true')
  })
})

describe('feedback set', () => {
  it('chip dismiss speaks its subject and emits', async () => {
    const wrapper = mount(DofChip, { props: { label: 'In stock', dismissible: true } })
    await wrapper.get('button[aria-label="Dismiss: In stock"]').trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('progress carries full ARIA and the words-first label', () => {
    const wrapper = mount(DofProgress, { props: { value: 4, max: 6, label: '4 of 6 packed' } })
    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('4')
    expect(bar.attributes('aria-valuemax')).toBe('6')
    expect(wrapper.text()).toContain('4 of 6 packed')
  })

  it('DofIconButton cannot render without a spoken label (required prop) and swaps to spinner when loading', () => {
    const wrapper = mount(DofIconButton, { props: { icon: 'pencil', label: 'Edit product', tooltip: false, loading: true } })
    const button = wrapper.get('button')
    expect(button.attributes('aria-label')).toBe('Edit product')
    expect(button.attributes('aria-busy')).toBe('true')
  })
})
