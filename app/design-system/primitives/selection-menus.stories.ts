/** Combobox, multi-select, dropdown, context menu, icon/split buttons. */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { h, ref } from 'vue'
import DofCombobox from './dof-combobox.vue'
import DofMultiSelect from './dof-multi-select.vue'
import DofDropdown, { type MenuItem } from './dof-dropdown.vue'
import DofContextMenu from './dof-context-menu.vue'
import DofIconButton from './dof-icon-button.vue'
import DofSplitButton from './dof-split-button.vue'
import DofButton from './dof-button.vue'
import DofText from './dof-text.vue'

const meta: Meta = { title: 'Primitives/Selection & Menus' }
export default meta

const CATEGORIES = [
  { value: 'soap', label: 'Home / Soap' },
  { value: 'candles', label: 'Home / Candles' },
  { value: 'ceramics', label: 'Home / Ceramics' },
  { value: 'cafe', label: 'Food / Café goods' },
]

export const Combobox: StoryObj = {
  render: () => {
    const value = ref<string>()
    return () =>
      h('div', { class: 'w-96' }, [
        h(DofCombobox, {
          label: 'Category',
          items: CATEGORIES,
          placeholder: 'Type to narrow…',
          emptyText: 'No matching category — pick the closest fit; taxonomy grows with you.',
          modelValue: value.value,
          'onUpdate:modelValue': (v?: string) => (value.value = v),
        }),
      ])
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByRole('combobox')
    await userEvent.type(input, 'cafe')
    const listbox = await waitFor(() => within(document.body).getByRole('listbox'))
    await expect(within(listbox).getByText('Food / Café goods')).toBeVisible()
    await expect(within(listbox).queryByText('Home / Soap')).toBeNull() // folded narrowing
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await expect(input).toHaveValue('Food / Café goods')
    // reopen: reka's aria-controls must reference a mounted listbox for the axe scan
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => within(document.body).getByRole('listbox'))
  },
}

export const MultiSelect: StoryObj = {
  render: () => {
    const values = ref<string[]>(['soap'])
    return () =>
      h('div', { class: 'w-96' }, [
        h(DofMultiSelect, {
          label: 'Collections',
          items: CATEGORIES,
          placeholder: 'Add to collections…',
          emptyText: 'No matches.',
          modelValue: values.value,
          'onUpdate:modelValue': (v: string[]) => (values.value = v),
        }),
        h(DofText, { role: 'caption', tone: 'faint' }, () => `model: [${values.value.join(', ')}]`),
      ])
  },
}

const ACTIONS: MenuItem[] = [
  { id: 'edit', label: 'Edit', icon: 'pencil' },
  { id: 'duplicate', label: 'Duplicate', icon: 'copy' },
  { id: 'share', label: 'Share', icon: 'share-2', disabled: true },
  { id: 'archive', label: 'Archive', icon: 'archive', critical: true },
]

export const DropdownAndContext: StoryObj = {
  render: () => {
    const last = ref('')
    return () =>
      h('div', { class: 'flex flex-col items-start gap-4' }, [
        h(DofDropdown, { items: ACTIONS, onSelect: (id: string) => (last.value = id) }, {
          default: () => h(DofButton, { variant: 'outline', tone: 'neutral', icon: 'ellipsis' }, () => 'Actions'),
        }),
        h(DofContextMenu, { items: ACTIONS, onSelect: (id: string) => (last.value = `context:${id}`) }, {
          default: () => h('div', { class: 'flex h-24 w-72 items-center justify-center rounded-medium border border-dashed border-line text-caption text-muted-foreground' }, 'Right-click me (gestures duplicate, never replace)'),
        }),
        last.value !== '' && h(DofText, { role: 'caption', tone: 'faint' }, () => `selected: ${last.value}`),
      ])
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }))
    const menu = await waitFor(() => within(document.body).getByRole('menu'))
    const items = within(menu).getAllByRole('menuitem')
    await expect(items[items.length - 1]).toHaveTextContent('Archive') // critical sits last
    await userEvent.click(within(menu).getByText('Edit'))
    await expect(canvas.getByText('selected: edit')).toBeVisible()
  },
}

export const Buttons: StoryObj = {
  render: () => {
    const last = ref('')
    return () =>
      h('div', { class: 'flex flex-col items-start gap-4' }, [
        h('div', { class: 'flex items-center gap-2' }, [
          h(DofIconButton, { icon: 'pencil', label: 'Edit product' }),
          h(DofIconButton, { icon: 'copy', label: 'Duplicate', variant: 'soft' }),
          h(DofIconButton, { icon: 'trash-2', label: 'Archive', variant: 'outline', tone: 'critical' }),
          h(DofIconButton, { icon: 'send', label: 'Sending…', loading: true }),
        ]),
        h(DofSplitButton, {
          label: 'Publish',
          menuLabel: 'More publish options',
          items: [
            { id: 'schedule', label: 'Schedule…', icon: 'clock' },
            { id: 'draft', label: 'Save as draft', icon: 'archive' },
          ],
          onClick: () => (last.value = 'publish'),
          onSelect: (id: string) => (last.value = id),
        }),
        last.value !== '' && h(DofText, { role: 'caption', tone: 'faint' }, () => `action: ${last.value}`),
      ])
  },
}
