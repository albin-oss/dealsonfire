/** useJourney — the resumable ceremony step machine (blocked steps educate). */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h, ref } from 'vue'
import { useJourney, type JourneyPersistence } from './composables/use-journey'
import DofButton from '../primitives/dof-button.vue'
import DofInput from '../primitives/dof-input.vue'
import DofText from '../primitives/dof-text.vue'

const meta: Meta = { title: 'Patterns/Journey' }
export default meta

interface DemoState { idea: string; name: string }

export const ResumableSteps: StoryObj = {
  render: () => {
    let snapshot: { stepId: string; state: DemoState } | null = null
    const persistence: JourneyPersistence<DemoState> = {
      load: async () => snapshot,
      save: async (s) => { snapshot = structuredClone(s) },
    }
    const journey = useJourney<DemoState>({
      steps: [
        { id: 'idea', validate: (s) => s.idea.trim() !== '' || 'Tell us one sentence about what you sell — it seeds everything else.' },
        { id: 'name', validate: (s) => s.name.trim() !== '' || 'Pick a name — you can rename anytime, nothing is locked.' },
        { id: 'done' },
      ],
      initialState: { idea: '', name: '' },
      persistence,
    })
    const saved = ref(false)

    return () =>
      h('div', { class: 'flex w-96 flex-col gap-4' }, [
        h(DofText, { role: 'caption', tone: 'faint' }, () => `Step ${journey.stepIndex.value + 1} of ${journey.stepCount} · drafts persist`),
        journey.current.value.id === 'idea' && h(DofInput, {
          label: 'What do you want to sell?',
          modelValue: journey.state.value.idea,
          'onUpdate:modelValue': (v: string) => (journey.state.value.idea = v),
        }),
        journey.current.value.id === 'name' && h(DofInput, {
          label: 'What should it be called?',
          modelValue: journey.state.value.name,
          'onUpdate:modelValue': (v: string) => (journey.state.value.name = v),
        }),
        journey.current.value.id === 'done' && h(DofText, { role: 'emphasis' }, () => `"${journey.state.value.name}" is ready — selling ${journey.state.value.idea}.`),
        journey.blockedReason.value && h(DofText, { role: 'caption', tone: 'muted', 'aria-live': 'polite' }, () => journey.blockedReason.value!),
        h('div', { class: 'flex gap-2' }, [
          h(DofButton, { variant: 'ghost', tone: 'neutral', disabled: journey.isFirst.value, onClick: () => void journey.back() }, () => 'Back'),
          !journey.isLast.value && h(DofButton, { tone: 'accent', onClick: () => void journey.next() }, () => 'Continue'),
          h(DofButton, { variant: 'soft', tone: 'neutral', onClick: async () => { saved.value = await journey.resume() } }, () => 'Simulate re-entry'),
        ]),
        saved.value && h(DofText, { role: 'caption', tone: 'faint' }, () => 'Resumed exactly where the draft left off.'),
      ])
  },
}
