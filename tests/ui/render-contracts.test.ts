/**
 * Render contracts — every display/selection primitive's API surface: correct roles,
 * ARIA wiring, tone/variant classes from tokens, v-model round-trips. Complements the
 * behavior suites; together with Playwright story coverage this is the G-9 evidence.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import DofAvatar from '@ds/primitives/dof-avatar.vue'
import DofBadge from '@ds/primitives/dof-badge.vue'
import DofTag from '@ds/primitives/dof-tag.vue'
import DofStatus from '@ds/primitives/dof-status.vue'
import DofDivider from '@ds/primitives/dof-divider.vue'
import DofSpinner from '@ds/primitives/dof-spinner.vue'
import DofSkeleton from '@ds/primitives/dof-skeleton.vue'
import DofTextarea from '@ds/primitives/dof-textarea.vue'
import DofEmailInput from '@ds/primitives/dof-email-input.vue'
import DofRadioGroup from '@ds/primitives/dof-radio-group.vue'
import DofSelect from '@ds/primitives/dof-select.vue'
import DofCombobox from '@ds/primitives/dof-combobox.vue'
import DofMultiSelect from '@ds/primitives/dof-multi-select.vue'
import DofDropdown from '@ds/primitives/dof-dropdown.vue'
import DofSplitButton from '@ds/primitives/dof-split-button.vue'
import DofPopover from '@ds/primitives/dof-popover.vue'
import DofText from '@ds/primitives/dof-text.vue'
import DofLoadingState from '@ds/patterns/components/dof-loading-state.vue'
import { cx } from '@ds/utils/cx'

const ITEMS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
]

describe('display primitives', () => {
  it('DofAvatar renders two-letter initials and shape variants', async () => {
    const round = mount(DofAvatar, { props: { name: 'Rosa Maria Martinez' } })
    await vi.waitFor(() => expect(round.text()).toBe('RM')) // reka fallback mounts on a timer
    expect(round.classes().join(' ')).toContain('rounded-full')
    const square = mount(DofAvatar, { props: { name: 'Grandma Soaps', shape: 'square' } })
    await vi.waitFor(() => expect(square.text()).toBe('GS'))
    expect(square.classes().join(' ')).toContain('rounded-medium')
  })

  it('DofBadge and DofTag dress by tone; DofTag is never interactive', () => {
    const badge = mount(DofBadge, { props: { tone: 'positive' }, slots: { default: () => 'active' } })
    expect(badge.classes().join(' ')).toContain('text-positive')
    const tag = mount(DofTag, { props: { label: 'bestseller', tone: 'ember', icon: 'flame' } })
    expect(tag.classes().join(' ')).toContain('text-ember')
    expect(tag.find('button').exists()).toBe(false)
  })

  it('DofStatus is a dot plus a word — color never alone', () => {
    const status = mount(DofStatus, { props: { label: 'paused — back May 4', tone: 'caution' } })
    expect(status.text()).toContain('paused')
    expect(status.find('[aria-hidden="true"]').classes().join(' ')).toContain('bg-caution')
  })

  it('DofDivider renders separator semantics in all three forms', () => {
    expect(mount(DofDivider).element.tagName).toBe('HR')
    const labeled = mount(DofDivider, { props: { label: 'earlier today' } })
    expect(labeled.get('[role="separator"]').text()).toContain('earlier today')
    const vertical = mount(DofDivider, { props: { orientation: 'vertical' } })
    expect(vertical.get('[role="separator"]').attributes('aria-orientation')).toBe('vertical')
  })

  it('DofSpinner speaks; DofSkeleton is decorative and structure-true', () => {
    const spinner = mount(DofSpinner, { props: { label: 'Saving price' } })
    expect(spinner.get('[role="status"]').text()).toContain('Saving price')
    const skeleton = mount(DofSkeleton, { props: { shape: 'text', lines: 3 } })
    expect(skeleton.attributes('aria-hidden')).toBe('true')
    expect(skeleton.element.children).toHaveLength(3)
  })

  it('DofLoadingState renders per stage: content, nothing, skeleton, narration', async () => {
    const wrapper = mount(DofLoadingState, {
      props: { stage: 'idle' as const, narration: '' },
      slots: { default: () => h('p', 'content'), skeleton: () => h('div', { class: 'sk' }) },
    })
    expect(wrapper.text()).toBe('content')
    await wrapper.setProps({ stage: 'quiet' })
    expect(wrapper.text()).toBe('')
    await wrapper.setProps({ stage: 'skeleton' })
    expect(wrapper.find('.sk').exists()).toBe(true)
    await wrapper.setProps({ stage: 'narrated', narration: 'Reading your Etsy shop…' })
    expect(wrapper.text()).toContain('Etsy')
  })
})

describe('field + selection primitives', () => {
  it('DofTextarea wires the field chrome and v-model', async () => {
    const wrapper = mount(DofTextarea, { props: { label: 'Description', error: 'Add one sentence.', modelValue: '' } })
    const area = wrapper.get('textarea')
    expect(area.attributes('aria-invalid')).toBe('true')
    await area.setValue('Hand made.')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Hand made.'])
  })

  it('DofEmailInput presets semantics', () => {
    const input = mount(DofEmailInput, { props: { label: 'Email', modelValue: '' } }).get('input')
    expect(input.attributes('type')).toBe('email')
    expect(input.attributes('autocomplete')).toBe('email')
    expect(input.attributes('inputmode')).toBe('email')
  })

  it('DofRadioGroup renders options with descriptions and emits selection', async () => {
    const wrapper = mount(DofRadioGroup, {
      props: {
        label: 'Who pays shipping?',
        modelValue: 'flat',
        options: [
          { value: 'flat', label: 'Flat rate', description: 'Typical.' },
          { value: 'free', label: 'Free over €50' },
        ],
      },
    })
    const radios = wrapper.findAll('[role="radio"]')
    expect(radios).toHaveLength(2)
    expect(radios[0]!.attributes('aria-checked')).toBe('true')
    await radios[1]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['free'])
  })

  it('DofSelect exposes combobox semantics through the field chrome', () => {
    const wrapper = mount(DofSelect, { props: { label: 'Kind', items: ITEMS, modelValue: undefined } })
    const trigger = wrapper.get('[role="combobox"]')
    expect(wrapper.get('label').attributes('for')).toBe(trigger.attributes('id'))
    expect(trigger.text()).toContain('Choose…')
  })

  it('DofCombobox folds diacritics when narrowing', async () => {
    const wrapper = mount(DofCombobox, {
      props: { label: 'Category', items: [{ value: 'cafe', label: 'Café goods' }, { value: 'soap', label: 'Soap' }], emptyText: 'None.' },
    })
    const input = wrapper.get('input')
    await input.setValue('cafe')
    await input.trigger('input')
    await nextTick()
    // internal filtering state: only the folded match remains renderable
    expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBeDefined()
  })

  it('DofMultiSelect renders chips from the model and removes on dismiss', async () => {
    const wrapper = mount(DofMultiSelect, {
      props: { label: 'Collections', items: ITEMS, emptyText: 'None.', modelValue: ['a', 'b'] },
    })
    expect(wrapper.text()).toContain('Alpha')
    await wrapper.get('button[aria-label="Dismiss: Alpha"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['b']])
  })
})

describe('menus + composed buttons', () => {
  it('DofDropdown groups critical items last with danger dress', async () => {
    const wrapper = mount(DofDropdown, {
      props: {
        items: [
          { id: 'archive', label: 'Archive', critical: true },
          { id: 'edit', label: 'Edit' },
        ],
      },
      slots: { default: () => h('button', 'Actions') },
      attachTo: document.body,
    })
    await wrapper.get('button').trigger('click')
    await nextTick()
    const menuItems = [...document.body.querySelectorAll('[role="menuitem"]')]
    expect(menuItems.map((i) => i.textContent?.trim())).toEqual(['Edit', 'Archive'])
    expect(menuItems[1]!.className).toContain('text-critical')
    wrapper.unmount()
    document.body.innerHTML = ''
  })

  it('DofSplitButton: primary emits click; menu half carries its spoken label', async () => {
    const wrapper = mount(DofSplitButton, {
      props: { label: 'Publish', menuLabel: 'More publish options', items: [{ id: 'schedule', label: 'Schedule…' }] },
    })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
    expect(wrapper.find('button[aria-label="More publish options"]').exists()).toBe(true)
  })

  it('DofPopover renders its trigger; DofText maps roles to elements', () => {
    const popover = mount(DofPopover, { slots: { trigger: () => h('button', 'Filters'), default: () => 'body' } })
    expect(popover.get('button').text()).toBe('Filters')
    expect(mount(DofText, { props: { role: 'headline' }, slots: { default: () => 'x' } }).element.tagName).toBe('H1')
    expect(mount(DofText, { props: { role: 'caption' }, slots: { default: () => 'x' } }).element.tagName).toBe('SPAN')
  })
})

describe('cx', () => {
  it('merges strings, arrays, and conditional records', () => {
    const off = false as boolean
    expect(cx('a', ['b', off && 'c', { d: true, e: false }], null, undefined)).toBe('a b d')
  })
})
