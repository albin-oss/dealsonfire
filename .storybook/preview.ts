/**
 * Global story context: theme scope × mode × direction toolbars (the gate axes of
 * DS-16). Attributes land on <html> so portaled content (selects, tooltips) themes
 * correctly, and on the decorator root for isolation.
 */
import type { Preview, Decorator } from '@storybook/vue3-vite'
import { h } from 'vue'
import '../app/design-system/tokens/theme.css'

const withTheme: Decorator = (story, context) => {
  const { scope, mode, direction } = context.globals as { scope: string; mode: string; direction: string }
  document.documentElement.setAttribute('data-scope', scope)
  document.documentElement.setAttribute('data-mode', mode)
  document.documentElement.setAttribute('dir', direction)
  return h(
    'div',
    { 'data-scope': scope, 'data-mode': mode, dir: direction, class: 'bg-surface text-foreground p-6 min-h-40' },
    [h(story())],
  )
}

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    scope: {
      description: 'Theme scope (DS-2)',
      toolbar: { title: 'Scope', items: ['workspace', 'storefront', 'marketplace', 'admin'] },
    },
    mode: {
      description: 'Color mode',
      toolbar: { title: 'Mode', items: ['light', 'dark'] },
    },
    direction: {
      description: 'Writing direction (G-8)',
      toolbar: { title: 'Direction', items: ['ltr', 'rtl'] },
    },
  },
  initialGlobals: { scope: 'workspace', mode: 'light', direction: 'ltr' },
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disable: true },
  },
}
export default preview
