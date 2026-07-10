/** Shortcuts registry, announcer, roving tabindex, focus trap — the a11y framework. */
import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { effectScope } from 'vue'
import { useShortcuts } from '@ds/a11y/use-shortcuts'
import { announce, useAnnouncer } from '@ds/a11y/announcer'
import { useRovingTabindex } from '@ds/a11y/use-roving-tabindex'
import { useFocusTrap } from '@ds/a11y/use-focus-trap'

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe('useShortcuts', () => {
  it('registers, fires, and conflict-checks', () => {
    const fired = vi.fn()
    const scope = effectScope()
    scope.run(() => {
      useShortcuts([{ combo: 'mod+k', description: 'ask bar', handler: fired }])
      expect(() => useShortcuts([{ combo: 'mod+K', description: 'dup', handler: () => {} }]))
        .toThrow(/conflict/)
    })
    press('k', { metaKey: true })
    expect(fired).toHaveBeenCalledOnce()
    scope.stop() // releases registrations
    press('k', { metaKey: true })
    expect(fired).toHaveBeenCalledOnce()
  })

  it('skips editable targets unless opted in', () => {
    const fired = vi.fn()
    const scope = effectScope()
    scope.run(() => useShortcuts([{ combo: 'a', description: 'test', handler: fired }]))
    const input = document.createElement('input')
    document.body.appendChild(input)
    press('a', {}, input)
    expect(fired).not.toHaveBeenCalled()
    input.remove()
    scope.stop()
  })
})

describe('announcer', () => {
  it('clear-then-set so repeats re-announce; assertive is a separate channel', async () => {
    vi.useFakeTimers()
    try {
      const { politeMessage, assertiveMessage } = useAnnouncer()
      announce('Three orders packed.')
      expect(politeMessage.value).toBe('')
      vi.advanceTimersByTime(31)
      expect(politeMessage.value).toBe('Three orders packed.')
      announce('Payment failed.', { assertive: true })
      vi.advanceTimersByTime(31)
      expect(assertiveMessage.value).toBe('Payment failed.')
      expect(politeMessage.value).toBe('Three orders packed.')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('useRovingTabindex', () => {
  it('one tab stop; arrows move focus; Home/End jump', () => {
    const roving = useRovingTabindex({ orientation: 'horizontal' })
    const buttons = ['a', 'b', 'c'].map((label) => {
      const el = document.createElement('button')
      el.textContent = label
      document.body.appendChild(el)
      roving.register(el)
      return el
    })
    expect(buttons.map((b) => b.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])

    const container = document.body
    container.addEventListener('keydown', roving.onKeydown as EventListener)
    press('ArrowRight', {}, buttons[0]!)
    expect(buttons.map((b) => b.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])
    expect(document.activeElement).toBe(buttons[1])
    press('End', {}, buttons[1]!)
    expect(document.activeElement).toBe(buttons[2])
    press('ArrowRight', {}, buttons[2]!) // wraps
    expect(document.activeElement).toBe(buttons[0])
    buttons.forEach((b) => { roving.unregister(b); b.remove() })
    container.removeEventListener('keydown', roving.onKeydown as EventListener)
  })
})

describe('useFocusTrap', () => {
  it('traps Tab within the container and restores focus on release', async () => {
    const outside = document.createElement('button')
    outside.textContent = 'outside'
    const container = document.createElement('div')
    const first = document.createElement('button')
    const last = document.createElement('button')
    container.append(first, last)
    document.body.append(outside, container)
    outside.focus()

    const containerRef = ref<HTMLElement | null>(container)
    const active = ref(false)
    const scope = effectScope()
    scope.run(() => useFocusTrap(containerRef, active))

    active.value = true
    await nextTick()
    expect(document.activeElement).toBe(first)

    last.focus()
    const event = press('Tab', {}, last)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)

    active.value = false
    await nextTick()
    expect(document.activeElement).toBe(outside) // focus returns where it was
    scope.stop()
    outside.remove()
    container.remove()
  })
})
