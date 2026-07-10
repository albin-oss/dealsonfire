/** DofMoney / DofTime — the constitutional renderers (DS-10). */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DofMoney from '@ds/primitives/dof-money.vue'
import DofTime from '@ds/primitives/dof-time.vue'

describe('DofMoney (minor units in, honest money out)', () => {
  const text = (props: Record<string, unknown>) =>
    mount(DofMoney, { props: props as never }).text().replace(/[\u00A0\u202F]/g, ' ')

  it('hides cents when they are zero (Bible §4.3)', () => {
    expect(text({ amount: 124000, currency: 'EUR', locale: 'en-IE' })).toBe('€1,240')
  })

  it('shows cents when they are real', () => {
    expect(text({ amount: 1499, currency: 'EUR', locale: 'en-IE' })).toBe('€14.99')
  })

  it('exact mode keeps full precision for signed amounts', () => {
    expect(text({ amount: 124000, currency: 'EUR', locale: 'en-IE' })).not.toContain('.00')
    expect(text({ amount: 124000, currency: 'EUR', locale: 'en-IE', exact: true })).toBe('€1,240.00')
  })

  it('handles zero-decimal currencies via Intl exponent', () => {
    expect(text({ amount: 5800, currency: 'JPY', locale: 'en-US' })).toBe('¥5,800')
  })

  it('refuses non-integer amounts with an educating message', () => {
    expect(() => mount(DofMoney, { props: { amount: 14.99, currency: 'EUR' } }))
      .toThrow(/integer minor units.*1499/)
  })

  it('emits a machine-readable <data> value', () => {
    const wrapper = mount(DofMoney, { props: { amount: 1499, currency: 'EUR' } })
    expect(wrapper.find('data').attributes('value')).toBe('1499 EUR')
  })
})

describe('DofTime (a real <time> element, µs/tz-safe rendering)', () => {
  const anchor = new Date('2026-07-06T12:00:00Z')

  it('renders machine datetime alongside human text', () => {
    const wrapper = mount(DofTime, { props: { value: anchor, mode: 'date', locale: 'en-US' } })
    expect(wrapper.find('time').attributes('datetime')).toBe('2026-07-06T12:00:00.000Z')
    expect(wrapper.text()).toContain('2026')
  })

  it('relative mode picks the largest sensible unit, pinned by `now`', () => {
    const threeHoursAgo = new Date(anchor.getTime() - 3 * 3_600_000)
    const wrapper = mount(DofTime, { props: { value: threeHoursAgo, mode: 'relative', now: anchor, locale: 'en-US' } })
    expect(wrapper.text()).toBe('3 hours ago')
  })

  it('relative mode handles future instants', () => {
    const inTwoDays = new Date(anchor.getTime() + 2 * 86_400_000)
    const wrapper = mount(DofTime, { props: { value: inTwoDays, mode: 'relative', now: anchor, locale: 'en-US' } })
    expect(wrapper.text()).toBe('in 2 days')
  })

  it('refuses invalid dates loudly', () => {
    expect(() => mount(DofTime, { props: { value: 'not-a-date' } })).toThrow(/invalid date/)
  })

  it('respects an explicit time zone', () => {
    const wrapper = mount(DofTime, { props: { value: anchor, mode: 'time', timeZone: 'UTC', locale: 'en-US' } })
    expect(wrapper.text()).toMatch(/12:00/)
  })
})
