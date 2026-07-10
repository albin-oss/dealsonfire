/** DofEmptyState, DofProblem, DofAnnouncer — the state vocabulary (UX-BIBLE §6.4). */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h, ref } from 'vue'
import DofEmptyState from './components/dof-empty-state.vue'
import DofProblem from './components/dof-problem.vue'
import DofAnnouncer from './components/dof-announcer.vue'
import DofButton from '../primitives/dof-button.vue'
import { announce } from '../a11y/announcer'

const meta: Meta = { title: 'Patterns/Feedback' }
export default meta

export const EmptyStateTeaches: StoryObj = {
  render: () => () =>
    h('div', { class: 'w-xl' }, [
      h(DofEmptyState, {
        icon: 'flame',
        title: 'Your first deal',
        why: 'Stores running deals get 3× the visits.',
        effort: '30 seconds',
      }, {
        action: () => h(DofButton, { tone: 'ember', icon: 'plus' }, () => 'Start a deal'),
      }),
    ]),
}

export const ProblemEducates: StoryObj = {
  render: () => {
    const retrying = ref(false)
    return () =>
      h('div', { class: 'flex w-xl flex-col gap-4' }, [
        h(DofProblem, {
          title: "We couldn't reach Etsy.",
          detail: 'Your products are safe — nothing was lost. Check that your shop is still connected, or try again.',
          code: 'ADAPTER_UNREACHABLE',
          retryable: true,
          retrying: retrying.value,
          onRetry: () => {
            retrying.value = true
            setTimeout(() => (retrying.value = false), 1200)
          },
        }),
        h(DofProblem, {
          title: 'That SKU is taken.',
          detail: 'SKU "SOAP-001" is already used by another product in this business — choose a different SKU, or leave it blank to auto-generate one.',
          code: 'SKU_TAKEN',
        }),
      ])
  },
}

export const Announcer: StoryObj = {
  render: () => () =>
    h('div', { class: 'flex flex-col gap-3' }, [
      h('p', { class: 'text-body text-muted-foreground' }, 'Announcements are invisible; inspect the live regions or use a screen reader.'),
      h('div', { class: 'flex gap-2' }, [
        h(DofButton, { variant: 'soft', tone: 'neutral', onClick: () => announce('Three orders packed. Nice work.') }, () => 'Announce politely'),
        h(DofButton, { variant: 'soft', tone: 'critical', onClick: () => announce('Payment failed for order 12.', { assertive: true }) }, () => 'Announce assertively'),
      ]),
      h(DofAnnouncer),
    ]),
}
