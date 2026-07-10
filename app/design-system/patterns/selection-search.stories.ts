/** useBulkSelection + useSearch over a product list — the catalog toolbar patterns. */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h, ref } from 'vue'
import { useBulkSelection } from './composables/use-bulk-selection'
import { useSearch } from './composables/use-search'
import DofButton from '../primitives/dof-button.vue'
import DofCheckbox from '../primitives/dof-checkbox.vue'
import DofInput from '../primitives/dof-input.vue'
import DofText from '../primitives/dof-text.vue'

const meta: Meta = { title: 'Patterns/Selection & Search' }
export default meta

const PRODUCTS = ['Lavender Soap', 'Rose Soap', 'Beeswax Candle', 'Café au Lait Mug', 'Linen Tote']

export const BulkSelectionWithSearch: StoryObj = {
  render: () => {
    const selection = useBulkSelection<string>()
    const search = useSearch()
    const log = ref('')

    return () =>
      h('div', { class: 'flex w-96 flex-col gap-3' }, [
        h(DofInput, {
          label: 'Search products',
          labelHidden: true,
          type: 'search',
          placeholder: 'Search (try "cafe" — diacritics fold)…',
          modelValue: search.query.value,
          'onUpdate:modelValue': (v: string) => (search.query.value = v),
        }),
        selection.active.value && h('div', { class: 'sticky top-0 flex items-center justify-between rounded-medium border border-line bg-surface-raised p-2 shadow-raised' }, [
          h(DofText, { role: 'caption' }, () => `${selection.count.value} selected`),
          h('div', { class: 'flex gap-2' }, [
            h(DofButton, { size: 'sm', variant: 'soft', tone: 'neutral', icon: 'archive', onClick: () => { log.value = `Archived: ${selection.take().join(', ')}` } }, () => 'Archive'),
            h(DofButton, { size: 'sm', variant: 'ghost', tone: 'neutral', onClick: selection.clear }, () => 'Clear'),
          ]),
        ]),
        ...PRODUCTS.filter((p) => search.matches(p)).map((product) =>
          h('div', { key: product, class: 'rounded-medium border border-line p-3' }, [
            h(DofCheckbox, {
              label: product,
              modelValue: selection.isSelected(product),
              'onUpdate:modelValue': () => selection.toggle(product),
            }),
          ])),
        log.value !== '' && h(DofText, { role: 'caption', tone: 'faint' }, () => log.value),
      ])
  },
}
