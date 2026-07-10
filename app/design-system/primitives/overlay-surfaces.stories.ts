/** DofCard, DofDialog, DofSheet, DofToastRegion — with play interaction tests (G-9). */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { h, ref } from 'vue'
import DofCard from './dof-card.vue'
import DofDialog from './dof-dialog.vue'
import DofSheet from './dof-sheet.vue'
import DofButton from './dof-button.vue'
import DofText from './dof-text.vue'
import DofBadge from './dof-badge.vue'
import DofToastRegion from '../patterns/components/dof-toast-region.vue'
import { notify } from '../patterns/composables/use-notices'

const meta: Meta = { title: 'Primitives/Surfaces' }
export default meta

export const Cards: StoryObj = {
  render: () => () =>
    h('div', { class: 'grid w-xl grid-cols-2 gap-4' }, [
      h(DofCard, null, {
        header: () => [h(DofText, { role: 'emphasis' }, () => 'Flat card'), h(DofBadge, { tone: 'neutral' }, () => 'draft')],
        default: () => h(DofText, { tone: 'muted' }, () => 'Static grouping — no shadow, honest depth.'),
      }),
      h(DofCard, { elevation: 'raised', interactive: true }, {
        header: () => h(DofText, { role: 'emphasis' }, () => 'Interactive card'),
        default: () => h(DofText, { tone: 'muted' }, () => 'Raised + focusable; activates on click or Enter.'),
        footer: () => h(DofBadge, { tone: 'positive' }, () => 'active'),
      }),
    ]),
}

export const Dialog: StoryObj = {
  render: () => {
    const open = ref(false)
    const confirmed = ref(false)
    return () =>
      h('div', { class: 'flex flex-col items-start gap-3' }, [
        h(DofButton, { tone: 'accent', onClick: () => (open.value = true) }, () => 'Publish product…'),
        confirmed.value && h(DofText, { tone: 'muted' }, () => 'Published. (Demo.)'),
        h(DofDialog, {
          title: 'Publish "Lavender Soap"?',
          description: 'Customers can see and buy it immediately. You can unpublish anytime.',
          open: open.value,
          'onUpdate:open': (v: boolean) => (open.value = v),
        }, {
          footer: ({ close }: { close: () => void }) => [
            h(DofButton, { variant: 'ghost', tone: 'neutral', onClick: close }, () => 'Cancel'),
            h(DofButton, { tone: 'accent', onClick: () => { confirmed.value = true; close() } }, () => 'Publish'),
          ],
        }),
      ])
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Publish product…' }))
    const dialog = await waitFor(() => within(document.body).getByRole('dialog'))
    await expect(dialog).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull())
    await expect(canvas.getByText('Published. (Demo.)')).toBeVisible()
  },
}

export const Sheet: StoryObj = {
  render: () => {
    const open = ref(false)
    return () =>
      h('div', null, [
        h(DofButton, { variant: 'outline', tone: 'neutral', onClick: () => (open.value = true) }, () => 'Open order #1042'),
        h(DofSheet, {
          title: 'Order #1042',
          open: open.value,
          'onUpdate:open': (v: boolean) => (open.value = v),
        }, {
          default: () => h(DofText, { tone: 'muted' }, () => 'The braid rule: objects open politely without losing your place.'),
        }),
      ])
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Open order #1042' }))
    const sheet = await waitFor(() => within(document.body).getByRole('dialog'))
    await expect(sheet).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull())
  },
}

export const Toasts: StoryObj = {
  render: () => () =>
    h('div', { class: 'flex flex-col items-start gap-3 pt-24' }, [
      h('div', { class: 'flex flex-wrap gap-2' }, [
        h(DofButton, { variant: 'soft', tone: 'positive', onClick: () => notify({ title: 'Label purchased for order #1042.', tone: 'positive' }) }, () => 'Quiet success'),
        h(DofButton, { variant: 'soft', tone: 'caution', onClick: () => notify({ title: 'Weekend deal ends soon.', tone: 'caution', deadline: new Date(Date.now() + 2 * 3_600_000) }) }, () => 'Real deadline'),
        h(DofButton, { variant: 'soft', tone: 'critical', onClick: () => notify({ title: 'Payout needs attention.', body: 'Verify your bank account to receive this payout.', tone: 'critical', sticky: true }) }, () => 'Sticky (money)'),
      ]),
      h(DofText, { role: 'caption', tone: 'faint' }, () => 'Calm rules: quiet by default, urgency requires a real deadline, max 3 visible.'),
      h(DofToastRegion),
    ]),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Quiet success' }))
    await expect(await canvas.findByText('Label purchased for order #1042.')).toBeVisible()
  },
}
