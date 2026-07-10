/** useLoadingStage (honesty about time) + useInlineEdit (edit where you look). */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h, ref } from 'vue'
import { useLoadingStage } from './composables/use-loading-stage'
import { useInlineEdit } from './composables/use-inline-edit'
import DofSkeleton from '../primitives/dof-skeleton.vue'
import DofButton from '../primitives/dof-button.vue'
import DofText from '../primitives/dof-text.vue'

const meta: Meta = { title: 'Patterns/Loading & Editing' }
export default meta

export const LoadingStages: StoryObj = {
  render: () => {
    const loading = useLoadingStage()
    const result = ref('')

    function simulate(totalMs: number) {
      result.value = ''
      loading.start()
      if (totalMs > 3000) {
        setTimeout(() => loading.narrate('Reading your Etsy shop…'), 3100)
        setTimeout(() => loading.narrate('Found 34 products — drafting descriptions…'), 4400)
      }
      setTimeout(() => { loading.finish(); result.value = `Done after ${totalMs}ms` }, totalMs)
    }

    return () =>
      h('div', { class: 'flex w-96 flex-col gap-4' }, [
        h('div', { class: 'flex gap-2' }, [
          h(DofButton, { size: 'sm', variant: 'soft', tone: 'neutral', onClick: () => simulate(300) }, () => '300ms (nothing)'),
          h(DofButton, { size: 'sm', variant: 'soft', tone: 'neutral', onClick: () => simulate(1500) }, () => '1.5s (skeleton)'),
          h(DofButton, { size: 'sm', variant: 'soft', tone: 'neutral', onClick: () => simulate(6000) }, () => '6s (narrated)'),
        ]),
        loading.stage.value === 'skeleton' && h(DofSkeleton, { shape: 'text', lines: 3 }),
        loading.stage.value === 'narrated' && h('div', { class: 'flex flex-col gap-2' }, [
          h(DofSkeleton, { shape: 'text', lines: 3 }),
          h(DofText, { role: 'caption', tone: 'muted', 'aria-live': 'polite' }, () => loading.narration.value || 'Working…'),
        ]),
        result.value !== '' && h(DofText, { tone: 'muted' }, () => result.value),
      ])
  },
}

export const InlineEdit: StoryObj = {
  render: () => {
    const title = ref('Lavender Soap')
    const failNext = ref(false)
    const edit = useInlineEdit({
      value: () => title.value,
      save: async (next) => {
        await new Promise((r) => setTimeout(r, 400))
        if (failNext.value) { failNext.value = false; throw new Error('save failed') }
        title.value = next
      },
    })

    return () =>
      h('div', { class: 'flex w-96 flex-col gap-3' }, [
        edit.editing.value
          ? h('input', {
              class: 'rounded-medium border border-accent bg-surface-raised px-3 py-2 text-title font-semibold text-foreground focus-visible:focus-ring',
              value: edit.draft.value,
              disabled: edit.saving.value,
              onInput: (e: Event) => (edit.draft.value = (e.target as HTMLInputElement).value),
              ...edit.keyHandlers,
              onBlur: () => void edit.commit(),
            })
          : h('button', {
              class: 'dof-interactive rounded-medium px-3 py-2 text-start text-title font-semibold text-foreground hover:bg-surface-sunken focus-visible:focus-ring',
              onClick: edit.begin,
            }, `${title.value} ✎`),
        h(DofText, { role: 'caption', tone: 'faint' }, () => 'Click to edit · Enter commits · Esc reverts · unchanged commits are silent no-ops'),
      ])
  },
}
