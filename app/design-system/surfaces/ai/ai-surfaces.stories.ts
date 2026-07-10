/** AI surfaces — the quartet rendered (DofProposalCard, DofConfidence). */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { expect, userEvent, within } from 'storybook/test'
import { h, ref } from 'vue'
import DofProposalCard from './dof-proposal-card.vue'
import DofConfidence from './dof-confidence.vue'
import DofText from '../../primitives/dof-text.vue'
import type { ProposalStatus } from '../../patterns/composables/use-proposal'

const meta: Meta = { title: 'Surfaces/AI' }
export default meta

export const ProposalCard: StoryObj = {
  render: () => {
    const status = ref<ProposalStatus>('pending')
    const outcome = ref('')
    return () =>
      h('div', { class: 'flex w-xl flex-col gap-3' }, [
        h(DofProposalCard, {
          intent: 'Set up "Grandma Soaps" around what you told me.',
          evidence: ['You said: “my lavender soaps” — that reads as handmade home goods', 'You chose the warm terracotta identity'],
          assumptions: ['Assumes you ship physical orders yourself to start'],
          confidence: 'confident',
          rClass: 'R2',
          status: status.value,
          approveLabel: 'Make it my store',
          onApprove: () => { status.value = 'approved'; outcome.value = 'approved' },
          onDecline: (r: string) => { status.value = 'declined'; outcome.value = r },
        }, {
          preview: () => h(DofText, { role: 'caption', tone: 'muted' }, () => 'preview slot — the after-state, never a command list'),
        }),
        outcome.value !== '' && h(DofText, { role: 'caption', tone: 'faint' }, () => `outcome: ${outcome.value}`),
      ])
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('assumptions')).toBeVisible() // never collapsed away
    await userEvent.click(canvas.getByRole('button', { name: 'Make it my store' }))
    await expect(canvas.getByText('outcome: approved')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Not ever' })).toBeNull() // decided stays decided
  },
}

export const ConfidenceScale: StoryObj = {
  render: () => () =>
    h('div', { class: 'flex flex-col gap-2' }, (['certain', 'confident', 'estimate', 'guess'] as const).map((c) =>
      h(DofConfidence, { confidence: c }))),
}
