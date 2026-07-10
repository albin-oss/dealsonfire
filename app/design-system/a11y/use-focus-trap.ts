/**
 * useFocusTrap — the central focus manager for full-screen shells (DESIGN-SYSTEM-001
 * §11): trap only while active, restore focus on release. Overlay primitives get this
 * from reka-ui; this implementation serves DofRunShell/DofCeremonyShell and any
 * future full-screen surface, so there is exactly one trap behavior platform-wide.
 */
import { watch, onScopeDispose, type Ref } from 'vue'

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useFocusTrap(container: Ref<HTMLElement | null>, active: Ref<boolean>) {
  let previouslyFocused: HTMLElement | null = null

  function focusables(): HTMLElement[] {
    const root = container.value
    if (!root) return []
    // visibility check via attributes (layout-independent — works in happy-dom too)
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .filter((el) => !el.hasAttribute('hidden') && !el.closest('[hidden], [inert]') && el.getAttribute('aria-hidden') !== 'true')
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return
    const items = focusables()
    if (items.length === 0) return
    const first = items[0]!
    const last = items[items.length - 1]!
    const current = document.activeElement
    if (event.shiftKey && (current === first || !container.value?.contains(current))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && current === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function engage() {
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.addEventListener('keydown', onKeydown, true)
    const items = focusables()
    ;(items[0] ?? container.value)?.focus()
  }

  function release() {
    document.removeEventListener('keydown', onKeydown, true)
    previouslyFocused?.focus() // focus returns where it was — always (§11)
    previouslyFocused = null
  }

  watch(active, (isActive, was) => {
    if (isActive && !was) engage()
    else if (!isActive && was) release()
  }, { flush: 'post' })

  onScopeDispose(() => { if (active.value) release() })
}
