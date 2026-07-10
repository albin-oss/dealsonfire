/**
 * useProposal — the quartet rendered (intent · evidence · assumptions · confidence)
 * with the signature approval spec, plus useConfirmation's R3 typed challenge.
 * This is the reference rendering AI surfaces will formalize in UI-COM sprints.
 */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h, ref } from 'vue'
import { useProposal } from './composables/use-proposal'
import { useConfirmation } from './composables/use-confirmation'
import DofButton from '../primitives/dof-button.vue'
import DofBadge from '../primitives/dof-badge.vue'
import DofText from '../primitives/dof-text.vue'
import DofInput from '../primitives/dof-input.vue'
import DofIcon from '../primitives/dof-icon.vue'

const meta: Meta = { title: 'Patterns/Proposal & Confirmation' }
export default meta

export const ProposalCard: StoryObj = {
  render: () => {
    const outcome = ref('')
    const proposal = useProposal({
      intent: 'Add a "Weekend 15% off" deal on your 3 most-viewed products.',
      evidence: ['142 views this week, 0 deals running', 'Similar stores convert 3× with a weekend deal'],
      assumptions: ['Assumes weekend inventory can cover a 3× order pickup'],
      confidence: 'confident',
      rClass: 'R2',
      initiator: 'ai',
      onApprove: async () => { await new Promise((r) => setTimeout(r, 600)); outcome.value = 'Deal scheduled for Saturday 00:00.' },
      onDecline: (reason) => { outcome.value = reason === 'not_ever' ? 'Understood — I won’t suggest weekend deals again.' : 'Kept for later.' },
    })

    return () =>
      h('div', { class: 'flex w-xl flex-col gap-3' }, [
        h('div', { class: 'flex flex-col gap-3 rounded-large border border-line bg-surface-raised p-4 shadow-raised' }, [
          h('div', { class: 'flex items-center justify-between gap-2' }, [
            h('span', { class: 'flex items-center gap-2' }, [
              h(DofIcon, { name: 'sparkles', size: 'sm' }),
              h(DofText, { role: 'caption', tone: 'muted' }, () => 'Ignite · fairly sure · R2'),
            ]),
            h(DofBadge, { tone: 'neutral' }, () => proposal.status.value),
          ]),
          h(DofText, { role: 'emphasis' }, () => proposal.quartet.intent),
          h('ul', { class: 'flex flex-col gap-1' }, proposal.quartet.evidence.map((line) =>
            h('li', { class: 'flex items-start gap-2 text-body text-muted-foreground' }, [h(DofIcon, { name: 'trending-up', size: 'sm', class: 'mt-0.5 shrink-0' }), line]))),
          h('ul', null, proposal.quartet.assumptions.map((line) =>
            h('li', { class: 'flex items-start gap-2 text-caption text-faint-foreground' }, [h(DofIcon, { name: 'circle-help', size: 'sm', class: 'mt-0.5 shrink-0' }), line]))),
          proposal.actionable.value && h('div', { class: 'flex items-center gap-2 pt-1' }, [
            h(DofButton, { tone: 'accent', loading: proposal.status.value === 'approving', onClick: () => void proposal.approve('user') }, () => 'Approve'),
            h(DofButton, { variant: 'ghost', tone: 'neutral', onClick: () => proposal.decline('not_now') }, () => 'Not now'),
            h(DofButton, { variant: 'ghost', tone: 'neutral', onClick: () => proposal.decline('not_ever') }, () => 'Not ever'),
          ]),
        ]),
        outcome.value !== '' && h(DofText, { tone: 'muted' }, () => outcome.value),
      ])
  },
}

export const DangerConfirmation: StoryObj = {
  render: () => {
    const done = ref('')
    const confirmation = useConfirmation({
      rClass: 'R3',
      summary: 'Close the store "grandma-soaps" permanently. Customers lose access; the handle is quarantined for 90 days.',
      challenge: 'grandma-soaps',
      onConfirm: async () => { await new Promise((r) => setTimeout(r, 500)); done.value = 'Store closed. (Demo.)' },
    })

    return () =>
      h('div', { class: 'flex w-xl flex-col gap-3' }, [
        h(DofButton, { variant: 'outline', tone: 'critical', onClick: confirmation.request }, () => 'Close store…'),
        confirmation.open.value && h('div', { class: 'flex flex-col gap-3 rounded-large border border-critical/30 bg-surface-raised p-4 shadow-overlay', role: 'alertdialog', 'aria-label': 'Confirm store closure' }, [
          h(DofText, { role: 'emphasis' }, () => confirmation.summary),
          h(DofInput, {
            label: 'Type the store handle to confirm',
            modelValue: confirmation.typed.value,
            'onUpdate:modelValue': (v: string) => (confirmation.typed.value = v),
            placeholder: 'grandma-soaps',
          }),
          h('div', { class: 'flex gap-2' }, [
            h(DofButton, { tone: 'critical', disabled: !confirmation.satisfied.value, loading: confirmation.busy.value, onClick: () => void confirmation.confirm() }, () => 'Close store'),
            h(DofButton, { variant: 'ghost', tone: 'neutral', onClick: confirmation.cancel }, () => 'Cancel'),
          ]),
        ]),
        done.value !== '' && h(DofText, { tone: 'muted' }, () => done.value),
      ])
  },
}
