/** DofMoney + DofTime — the constitutional renderers (DS-10 gate evidence). */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h } from 'vue'
import DofMoney from './dof-money.vue'
import DofTime from './dof-time.vue'
import DofText from './dof-text.vue'

const meta: Meta = { title: 'Primitives/Formatters' }
export default meta

const row = (label: string, node: ReturnType<typeof h>) =>
  h('div', { class: 'flex items-baseline justify-between gap-6 border-b border-line py-2' }, [
    h(DofText, { role: 'caption', tone: 'muted' }, () => label),
    node,
  ])

export const Money: StoryObj = {
  render: () => () =>
    h('div', { class: 'w-96' }, [
      row('whole euros hide cents', h(DofMoney, { amount: 124000, currency: 'EUR' })),
      row('cents show when real', h(DofMoney, { amount: 1499, currency: 'EUR' })),
      row('exact mode (signed amounts)', h(DofMoney, { amount: 124000, currency: 'EUR', exact: true })),
      row('zero-decimal currency', h(DofMoney, { amount: 5800, currency: 'JPY' })),
      row('compare-at price', h(DofMoney, { amount: 2000, currency: 'EUR', struck: true })),
      row('locale-aware', h(DofMoney, { amount: 1499, currency: 'USD', locale: 'de-DE' })),
    ]),
}

export const Time: StoryObj = {
  render: () => {
    const anchor = new Date('2026-07-06T12:00:00Z')
    const threeHoursEarlier = new Date('2026-07-06T09:00:00Z')
    return () =>
      h('div', { class: 'w-96' }, [
        row('date', h(DofTime, { value: anchor, mode: 'date' })),
        row('datetime', h(DofTime, { value: anchor, mode: 'datetime', timeZone: 'UTC' })),
        row('time', h(DofTime, { value: anchor, mode: 'time', timeZone: 'UTC' })),
        row('relative (pinned)', h(DofTime, { value: threeHoursEarlier, mode: 'relative', now: anchor })),
      ])
  },
}
