/** Chip, tag, status, progress, spinner, divider, loading-state. */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h, ref } from 'vue'
import DofChip from './dof-chip.vue'
import DofTag from './dof-tag.vue'
import DofStatus from './dof-status.vue'
import DofProgress from './dof-progress.vue'
import DofSpinner from './dof-spinner.vue'
import DofDivider from './dof-divider.vue'
import DofText from './dof-text.vue'
import DofButton from './dof-button.vue'
import DofLoadingState from '../patterns/components/dof-loading-state.vue'
import DofSkeleton from './dof-skeleton.vue'
import { useLoadingStage } from '../patterns/composables/use-loading-stage'

const meta: Meta = { title: 'Primitives/Feedback Set' }
export default meta

export const ChipsAndTags: StoryObj = {
  render: () => {
    const filters = ref(['Under €20', 'In stock'])
    const selected = ref(false)
    return () =>
      h('div', { class: 'flex flex-col gap-4' }, [
        h('div', { class: 'flex flex-wrap gap-2' }, [
          ...filters.value.map((f) => h(DofChip, { key: f, label: f, dismissible: true, onDismiss: () => (filters.value = filters.value.filter((x) => x !== f)) })),
          h(DofChip, { label: 'On sale', selectable: true, selected: selected.value, onToggle: () => (selected.value = !selected.value) }),
        ]),
        h('div', { class: 'flex flex-wrap gap-2' }, [
          h(DofTag, { label: 'handmade', icon: 'heart' }),
          h(DofTag, { label: 'bestseller', tone: 'ember', icon: 'flame' }),
          h(DofTag, { label: 'imported: etsy', tone: 'info' }),
        ]),
      ])
  },
}

export const StatusAndProgress: StoryObj = {
  render: () => () =>
    h('div', { class: 'flex w-96 flex-col gap-4' }, [
      h('div', { class: 'flex flex-wrap gap-4' }, [
        h(DofStatus, { label: 'active', tone: 'positive' }),
        h(DofStatus, { label: 'draft', tone: 'neutral' }),
        h(DofStatus, { label: 'paused — back May 4', tone: 'caution' }),
        h(DofStatus, { label: 'needs attention', tone: 'critical' }),
      ]),
      h(DofProgress, { value: 4, max: 6, label: '4 of 6 packed' }),
      h(DofDivider, { label: 'earlier today' }),
      h('div', { class: 'flex items-center gap-3' }, [h(DofSpinner, { size: 'sm', label: 'Saving price' }), h(DofText, { role: 'caption', tone: 'muted' }, () => 'inline, element-scoped work only')]),
    ]),
}

export const LoadingState: StoryObj = {
  render: () => {
    const loading = useLoadingStage()
    const items = ref<string[]>([])
    function fetchSlow() {
      items.value = []
      loading.start()
      setTimeout(() => loading.narrate('Reading your Etsy shop…'), 3200)
      setTimeout(() => { loading.finish(); items.value = ['Lavender Soap', 'Rose Soap', 'Beeswax Candle'] }, 5000)
    }
    return () =>
      h('div', { class: 'flex w-96 flex-col gap-3' }, [
        h(DofButton, { variant: 'soft', tone: 'neutral', onClick: fetchSlow }, () => 'Load (5s — full staging)'),
        h(DofLoadingState, { stage: loading.stage.value, narration: loading.narration.value }, {
          skeleton: () => h(DofSkeleton, { shape: 'text', lines: 3 }),
          default: () => h('ul', { class: 'flex flex-col gap-1' }, items.value.map((i) => h('li', { class: 'text-body text-foreground' }, i))),
        }),
      ])
  },
}
