/**
 * useRovingTabindex — one tab stop per composite widget (DESIGN-SYSTEM-001 §11):
 * arrow keys move within grids/toolbars/option matrices; Tab leaves. Home/End jump.
 * Items register/unregister themselves; DOM order is the navigation order.
 */
import { ref, readonly } from 'vue'

export function useRovingTabindex(options: { orientation?: 'horizontal' | 'vertical' | 'both' } = {}) {
  const orientation = options.orientation ?? 'both'
  const items = ref<HTMLElement[]>([])
  const activeIndex = ref(0)

  function register(el: HTMLElement) {
    items.value = [...items.value, el].sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)
    sync()
  }

  function unregister(el: HTMLElement) {
    items.value = items.value.filter((item) => item !== el)
    if (activeIndex.value >= items.value.length) activeIndex.value = Math.max(0, items.value.length - 1)
    sync()
  }

  function sync() {
    items.value.forEach((el, i) => el.setAttribute('tabindex', i === activeIndex.value ? '0' : '-1'))
  }

  function move(to: number) {
    if (items.value.length === 0) return
    activeIndex.value = (to + items.value.length) % items.value.length
    sync()
    items.value[activeIndex.value]!.focus()
  }

  function onKeydown(event: KeyboardEvent) {
    const horizontal = orientation !== 'vertical'
    const vertical = orientation !== 'horizontal'
    const isRtl = (event.currentTarget as HTMLElement | null)?.closest('[dir]')?.getAttribute('dir') === 'rtl'
    const forward = isRtl ? 'ArrowLeft' : 'ArrowRight'
    const backward = isRtl ? 'ArrowRight' : 'ArrowLeft'

    if ((horizontal && event.key === forward) || (vertical && event.key === 'ArrowDown')) {
      event.preventDefault(); move(activeIndex.value + 1)
    } else if ((horizontal && event.key === backward) || (vertical && event.key === 'ArrowUp')) {
      event.preventDefault(); move(activeIndex.value - 1)
    } else if (event.key === 'Home') {
      event.preventDefault(); move(0)
    } else if (event.key === 'End') {
      event.preventDefault(); move(items.value.length - 1)
    }
  }

  return { register, unregister, onKeydown, activeIndex: readonly(activeIndex) }
}
