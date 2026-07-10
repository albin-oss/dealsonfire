/** Component ARIA wiring + token-contract behavior (button, field chrome, choices). */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DofButton from '@ds/primitives/dof-button.vue'
import DofInput from '@ds/primitives/dof-input.vue'
import DofCheckbox from '@ds/primitives/dof-checkbox.vue'
import DofSwitch from '@ds/primitives/dof-switch.vue'
import DofEmptyState from '@ds/patterns/components/dof-empty-state.vue'
import DofProblem from '@ds/patterns/components/dof-problem.vue'
import { brandKitStyle } from '@ds/tokens/brand-kit'

describe('DofButton', () => {
  it('defaults to type=button and blocks clicks while loading (aria-busy)', async () => {
    const wrapper = mount(DofButton, { props: { loading: true }, slots: { default: () => 'Save' } })
    const button = wrapper.get('button')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('non-button tags get aria-disabled instead of the attribute', () => {
    const wrapper = mount(DofButton, { props: { as: 'a', disabled: true }, slots: { default: () => 'Link' } })
    expect(wrapper.get('a').attributes('aria-disabled')).toBe('true')
    expect(wrapper.get('a').attributes('disabled')).toBeUndefined()
  })
})

describe('DofInput field chrome', () => {
  it('associates label, error, and description; error takes describedby precedence', () => {
    const wrapper = mount(DofInput, {
      props: { label: 'SKU', description: 'Optional.', error: 'That SKU is taken — pick another.', modelValue: '' },
    })
    const input = wrapper.get('input')
    const label = wrapper.get('label')
    expect(label.attributes('for')).toBe(input.attributes('id'))
    expect(input.attributes('aria-invalid')).toBe('true')
    const describedBy = input.attributes('aria-describedby')!.split(' ')
    expect(describedBy).toHaveLength(2)
    const errorEl = wrapper.get(`#${CSS.escape(describedBy[0]!)}`)
    expect(errorEl.text()).toContain('taken')
    expect(errorEl.attributes('aria-live')).toBe('polite')
  })

  it('v-model round-trips', async () => {
    const wrapper = mount(DofInput, { props: { label: 'Title', modelValue: 'a' } })
    await wrapper.get('input').setValue('b')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['b'])
  })
})

describe('choice primitives', () => {
  it('DofCheckbox binds label and model', async () => {
    const wrapper = mount(DofCheckbox, { props: { label: 'Track quantities', modelValue: false } })
    const control = wrapper.get('button[role="checkbox"]')
    expect(wrapper.get('label').attributes('for')).toBe(control.attributes('id'))
    await control.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true])
  })

  it('DofSwitch exposes switch semantics', async () => {
    const wrapper = mount(DofSwitch, { props: { label: 'Store open', modelValue: false } })
    const control = wrapper.get('button[role="switch"]')
    expect(control.attributes('aria-checked')).toBe('false')
    await control.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true])
  })
})

describe('pattern components', () => {
  it('DofEmptyState cannot be built without the teaching contract', () => {
    const wrapper = mount(DofEmptyState, {
      props: { icon: 'flame', title: 'Your first deal', why: 'Stores running deals get 3× the visits.', effort: '30 seconds' },
    })
    expect(wrapper.text()).toContain('3× the visits')
    expect(wrapper.text()).toContain('30 seconds')
  })

  it('DofProblem carries the retry and hides the machine room behind Inspect', async () => {
    const wrapper = mount(DofProblem, {
      props: { title: "We couldn't reach Etsy.", detail: 'Nothing was lost.', code: 'ADAPTER_UNREACHABLE', retryable: true },
    })
    expect(wrapper.get('[role="alert"]').text()).toContain('Etsy')
    expect(wrapper.text()).not.toContain('ADAPTER_UNREACHABLE')
    await wrapper.get('button[aria-expanded]').trigger('click')
    expect(wrapper.text()).toContain('ADAPTER_UNREACHABLE')
    await wrapper.get('button.dof-interactive ~ *, button').trigger('click') // retry button exists
    expect(wrapper.findAll('button').some((b) => b.text().includes('Try again'))).toBe(true)
  })
})

describe('brandKitStyle (storefront scope hook)', () => {
  it('maps only provided keys to --dof-brand-* variables', () => {
    const style = brandKitStyle({ accent: 'oklch(50% 0.1 30)', fontUi: 'Georgia, serif' })
    expect(style).toEqual({
      '--dof-brand-accent': 'oklch(50% 0.1 30)',
      '--dof-brand-font-ui': 'Georgia, serif',
    })
  })
})
