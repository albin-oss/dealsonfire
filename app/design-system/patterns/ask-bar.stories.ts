/** DofAskBar + command registry + DofBreadcrumbs — the shell navigation surfaces. */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { h, ref, onUnmounted } from 'vue'
import DofAskBar from './components/dof-ask-bar.vue'
import { registerCommands, type SearchProvider } from './composables/commands'
import DofBreadcrumbs from '../primitives/dof-breadcrumbs.vue'
import DofButton from '../primitives/dof-button.vue'
import DofText from '../primitives/dof-text.vue'

const meta: Meta = { title: 'Patterns/Ask Bar & Breadcrumbs' }
export default meta

const DEMO_PROVIDER: SearchProvider = {
  id: 'demo',
  label: 'Products (demo provider)',
  search: async (term) => [{ id: 'p1', label: `Products matching “${term}”`, hint: 'provider seam', run: () => {} }],
}

export const AskBar: StoryObj = {
  render: () => {
    const open = ref(false)
    const last = ref('')
    const { release } = registerCommands([
      { id: 'demo.products', label: 'Go to Products', group: 'Go to', icon: 'package', run: () => (last.value = 'nav:products') },
      { id: 'demo.orders', label: 'Go to Orders', group: 'Go to', icon: 'shopping-bag', run: () => (last.value = 'nav:orders') },
      { id: 'demo.deal', label: 'Start a deal', group: 'Actions', icon: 'flame', keywords: ['promotion'], run: () => (last.value = 'action:deal') },
    ])
    onUnmounted(release)
    return () =>
      h('div', { class: 'flex flex-col items-start gap-3' }, [
        h(DofButton, { variant: 'outline', tone: 'neutral', icon: 'search', onClick: () => (open.value = true) }, () => 'Search or jump to…'),
        last.value !== '' && h(DofText, { role: 'caption', tone: 'faint' }, () => `ran: ${last.value}`),
        h(DofAskBar, {
          open: open.value,
          'onUpdate:open': (v: boolean) => (open.value = v),
          recentSearches: ['lavender soap', 'weekend deal'],
          providers: [DEMO_PROVIDER],
          onSearch: (t: string) => (last.value = `search:${t}`),
        }),
      ])
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Search or jump/ }))
    const dialog = await waitFor(() => within(document.body).getByRole('dialog'))
    await expect(within(dialog).getByText('Recent')).toBeVisible() // recents before typing
    await userEvent.keyboard('deal')
    await waitFor(async () => {
      await expect(within(dialog).getByText('Start a deal')).toBeVisible()
      await expect(within(dialog).queryByText('Go to Orders')).toBeNull() // narrowed
    })
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull())
    await expect(canvas.getByText(/ran: (action:deal|search:deal)/)).toBeVisible()
  },
}

export const Breadcrumbs: StoryObj = {
  render: () => {
    const last = ref('')
    return () =>
      h('div', { class: 'flex flex-col gap-2' }, [
        h(DofBreadcrumbs, {
          items: [
            { id: 'home', label: 'Home' },
            { id: 'products', label: 'Products' },
            { id: 'p1', label: 'Lavender Soap' },
          ],
          onNavigate: (id: string) => (last.value = id),
        }),
        last.value !== '' && h(DofText, { role: 'caption', tone: 'faint' }, () => `navigate: ${last.value}`),
      ])
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Lavender Soap')).toHaveAttribute('aria-current', 'page')
    await userEvent.click(canvas.getByRole('button', { name: 'Products' }))
    await expect(canvas.getByText('navigate: products')).toBeVisible()
  },
}
