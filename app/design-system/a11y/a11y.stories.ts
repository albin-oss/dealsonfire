/** A11y framework — roving tabindex, shortcuts registry (the cheat-sheet source). */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRovingTabindex } from './use-roving-tabindex'
import { useShortcuts, listShortcuts } from './use-shortcuts'
import DofText from '../primitives/dof-text.vue'
import DofBadge from '../primitives/dof-badge.vue'

const meta: Meta = { title: 'A11y/Framework' }
export default meta

export const RovingToolbar: StoryObj = {
  render: () => {
    const roving = useRovingTabindex({ orientation: 'horizontal' })
    const items = ['Bold', 'Italic', 'Link', 'Image']
    const refs: HTMLElement[] = []
    onMounted(() => refs.forEach((el) => roving.register(el)))
    onBeforeUnmount(() => refs.forEach((el) => roving.unregister(el)))
    return () =>
      h('div', { class: 'flex flex-col gap-2' }, [
        h('div', { role: 'toolbar', 'aria-label': 'formatting', class: 'flex gap-1', onKeydown: roving.onKeydown }, items.map((label, i) =>
          h('button', {
            ref: (el) => { if (el) refs[i] = el as HTMLElement },
            type: 'button',
            class: 'dof-interactive rounded-small px-3 py-1.5 text-body text-foreground hover:bg-surface-sunken focus-visible:focus-ring',
          }, label))),
        h(DofText, { role: 'caption', tone: 'faint' }, () => 'One tab stop; arrows move (RTL-aware); Home/End jump.'),
      ])
  },
}

export const ShortcutRegistry: StoryObj = {
  render: () => {
    const lastFired = ref('')
    useShortcuts([
      { combo: 'mod+k', description: 'Open the ask bar', handler: () => (lastFired.value = 'mod+k → ask bar') },
      { combo: 'shift+/', description: 'Show shortcuts', handler: () => (lastFired.value = 'shift+/ → cheat sheet') },
    ])
    return () =>
      h('div', { class: 'flex flex-col gap-3' }, [
        h('div', { class: 'flex flex-col gap-1' }, listShortcuts().map((s) =>
          h('div', { class: 'flex items-center gap-2' }, [h(DofBadge, { tone: 'neutral' }, () => s.combo), h(DofText, { role: 'caption', tone: 'muted' }, () => s.description)]))),
        h(DofText, { role: 'caption', tone: 'faint' }, () => lastFired.value || 'Press a shortcut…'),
      ])
  },
}
