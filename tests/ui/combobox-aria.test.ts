/**
 * C11 closure finding — the collapsed-combobox ARIA invariant.
 *
 * reka v2 leaves `aria-activedescendant` on the input after the list closes,
 * still naming the last-highlighted item — an id that no longer exists once
 * the options unmount (axe: aria-valid-attr-value, impact critical, and
 * intermittent in the full sweep because it depends on highlight timing).
 *
 * The invariant DOF owns at the wrapper boundary:
 *   WHEN collapsed, aria-activedescendant is ABSENT — or, if ever present,
 *   it references an element that actually exists.
 *
 * Proven here across every lifecycle the correction must survive:
 * open → navigate → select → close · open → navigate → escape ·
 * open → close without selection · repeated open/close cycles.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DofCombobox from '@ds/primitives/dof-combobox.vue'
import DofMultiSelect from '@ds/primitives/dof-multi-select.vue'

const ITEMS = [
  { value: 'cafe', label: 'Café goods' },
  { value: 'soap', label: 'Soap' },
  { value: 'wool', label: 'Wool' },
]

/** The invariant, verbatim: absent — or naming a real element. */
function expectCollapsedInvariant(input: HTMLInputElement) {
  expect(input.getAttribute('aria-expanded')).toBe('false')
  const ref = input.getAttribute('aria-activedescendant')
  if (ref !== null) {
    expect(document.getElementById(ref), `aria-activedescendant="${ref}" must reference a mounted element`).not.toBeNull()
  }
}

async function settle() {
  await nextTick()
  await nextTick()
}

describe('collapsed combobox never points at a ghost (aria-activedescendant)', () => {
  it('DofCombobox: open → navigate → select → close keeps the invariant', async () => {
    const wrapper = mount(DofCombobox, {
      props: { label: 'Category', items: ITEMS, emptyText: 'None.' },
      attachTo: document.body,
    })
    const input = wrapper.get('input').element as HTMLInputElement

    await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' }) // opens + highlights
    await settle()
    await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' })
    await wrapper.get('input').trigger('keydown', { key: 'Enter' }) // selects + closes
    await vi.waitFor(() => expect(input.getAttribute('aria-expanded')).toBe('false'))
    await settle()
    expectCollapsedInvariant(input)
    wrapper.unmount()
  })

  it('DofCombobox: open → navigate → escape keeps the invariant', async () => {
    const wrapper = mount(DofCombobox, {
      props: { label: 'Category', items: ITEMS, emptyText: 'None.' },
      attachTo: document.body,
    })
    const input = wrapper.get('input').element as HTMLInputElement

    await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' })
    await settle()
    await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' })
    await wrapper.get('input').trigger('keydown', { key: 'Escape' })
    await vi.waitFor(() => expect(input.getAttribute('aria-expanded')).toBe('false'))
    await settle()
    expectCollapsedInvariant(input)
    wrapper.unmount()
  })

  it('DofCombobox: open → close without selection, and repeated cycles, keep the invariant', async () => {
    const wrapper = mount(DofCombobox, {
      props: { label: 'Category', items: ITEMS, emptyText: 'None.' },
      attachTo: document.body,
    })
    const input = wrapper.get('input').element as HTMLInputElement

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' }) // open + highlight
      await settle()
      expect(input.getAttribute('aria-expanded')).toBe('true')
      await wrapper.get('input').trigger('keydown', { key: 'Escape' }) // close, nothing chosen
      await vi.waitFor(() => expect(input.getAttribute('aria-expanded')).toBe('false'))
      await settle()
      expectCollapsedInvariant(input)
    }
    // after all cycles the combobox still works: it reopens with live options
    await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' })
    await settle()
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelectorAll('[role="option"]').length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('DofMultiSelect: the same boundary correction holds through select and escape', async () => {
    const wrapper = mount(DofMultiSelect, {
      props: { label: 'Kinds', items: ITEMS, emptyText: 'None.', modelValue: [] },
      attachTo: document.body,
    })
    const input = wrapper.get('input').element as HTMLInputElement

    await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' })
    await settle()
    await wrapper.get('input').trigger('keydown', { key: 'Enter' }) // pick one (multiple keeps open in reka; Escape closes)
    await wrapper.get('input').trigger('keydown', { key: 'Escape' })
    await vi.waitFor(() => expect(input.getAttribute('aria-expanded')).toBe('false'))
    await settle()
    expectCollapsedInvariant(input)
    wrapper.unmount()
  })
})
