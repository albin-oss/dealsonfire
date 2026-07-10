/** useUndoable + DofUndoToast — the R0/R1 apply-with-undo pattern, live. */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h, ref } from 'vue'
import { useUndoable } from './composables/use-undoable'
import DofUndoToast from './components/dof-undo-toast.vue'
import DofButton from '../primitives/dof-button.vue'
import DofText from '../primitives/dof-text.vue'
import { cx } from '../utils/cx'

const meta: Meta = { title: 'Patterns/Undoable' }
export default meta

export const ArchiveWithUndo: StoryObj = {
  render: () => {
    const products = ref([
      { id: 'p1', title: 'Lavender Soap', archived: false },
      { id: 'p2', title: 'Rose Soap', archived: false },
      { id: 'p3', title: 'Beeswax Candle', archived: false },
    ])
    const committed = ref<string[]>([])
    const undone = ref<string[]>([])
    const undoable = useUndoable({
      onCommitted: (entry) => committed.value.push(entry.label),
      onUndone: (entry) => undone.value.push(entry.label),
    })

    function archive(id: string) {
      const product = products.value.find((p) => p.id === id)!
      void undoable.run({
        label: `Archived ${product.title}`,
        rClass: 'R1',
        apply: () => { product.archived = true },
        undo: () => { product.archived = false },
      })
    }

    return () =>
      h('div', { class: 'flex w-96 flex-col gap-3 pb-24' }, [
        ...products.value.map((product) =>
          h('div', { key: product.id, class: cx('flex items-center justify-between rounded-medium border border-line p-3', product.archived && 'opacity-disabled') }, [
            h(DofText, null, () => product.title),
            h(DofButton, { size: 'sm', variant: 'ghost', tone: 'neutral', icon: 'archive', disabled: product.archived, onClick: () => archive(product.id) }, () => 'Archive'),
          ])),
        committed.value.length > 0 && h(DofText, { role: 'caption', tone: 'faint' }, () => `Committed (digest-reported): ${committed.value.join(' · ')}`),
        undone.value.length > 0 && h(DofText, { role: 'caption', tone: 'faint' }, () => `Reversed (Ignite self-demotion signal): ${undone.value.join(' · ')}`),
        h(DofUndoToast, { undoable }),
      ])
  },
}
