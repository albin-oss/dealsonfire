/** Batch 1A: DofCard, DofDialog, DofSheet, notices pipeline, workspace layout, i18n. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import DofCard from '@ds/primitives/dof-card.vue'
import DofDialog from '@ds/primitives/dof-dialog.vue'
import DofWorkspaceLayout, { type WorkspaceNavItem } from '@ds/layouts/dof-workspace-layout.vue'
import DofProblem from '@ds/patterns/components/dof-problem.vue'
import { useNotices, notify, dismiss } from '@ds/patterns/composables/use-notices'
import { provideDsMessages, DS_MESSAGES, type DsMessages } from '@ds/i18n'

afterEach(() => { document.body.innerHTML = '' })

describe('DofCard', () => {
  it('flat renders a div; interactive renders a real button and emits activate', async () => {
    const flat = mount(DofCard, { slots: { default: () => 'content' } })
    expect(flat.element.tagName).toBe('DIV')

    const interactive = mount(DofCard, { props: { interactive: true }, slots: { default: () => 'content' } })
    expect(interactive.element.tagName).toBe('BUTTON')
    expect(interactive.attributes('type')).toBe('button')
    await interactive.trigger('click')
    expect(interactive.emitted('activate')).toHaveLength(1)
  })
})

describe('DofDialog (the one interruption layer)', () => {
  it('opens with title semantics, closes via the close control, restores v-model', async () => {
    const wrapper = mount(DofDialog, {
      props: { title: 'Publish?', description: 'Customers can buy immediately.', open: true },
      slots: { default: () => 'body' },
      attachTo: document.body,
    })
    await nextTick()
    const dialog = document.body.querySelector('[role="dialog"]')!
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
    expect(dialog.textContent).toContain('Publish?')

    const close = document.body.querySelector<HTMLButtonElement>(`[aria-label="${DS_MESSAGES.common.close}"]`)!
    close.click()
    await nextTick()
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    wrapper.unmount()
  })
})

describe('notices pipeline (calm is API-shaped)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // drain the module-scope queue
    const { notices } = useNotices()
    for (const n of [...notices.value]) dismiss(n.id)
  })
  afterEach(() => vi.useRealTimers())

  it('quiet notices settle after the window; sticky ones stay', () => {
    const { notices } = useNotices()
    notify({ title: 'Label purchased.' })
    const sticky = notify({ title: 'Payout needs attention.', sticky: true })
    expect(notices.value).toHaveLength(2)

    vi.advanceTimersByTime(6001)
    expect(notices.value.map((n) => n.id)).toEqual([sticky])
    dismiss(sticky)
    expect(notices.value).toHaveLength(0)
  })

  it('only a real deadline earns urgency data; the API has no urgency flag', () => {
    const { notices } = useNotices()
    notify({ title: 'Deal ends soon.', deadline: new Date(Date.now() + 3_600_000) })
    expect(notices.value[0]!.deadline).toBeInstanceOf(Date)
    // @ts-expect-error — there is deliberately no `urgent` option (UX-BIBLE §1.3)
    notify({ title: 'x', urgent: true })
  })

  it('visible caps at three; the rest wait their turn', () => {
    const { visible, notices } = useNotices()
    for (let i = 0; i < 5; i++) notify({ title: `n${i}` })
    expect(notices.value).toHaveLength(5)
    expect(visible()).toHaveLength(3)
    dismiss(notices.value[0]!.id)
    expect(visible().map((n) => n.title)).toEqual(['n1', 'n2', 'n3'])
  })
})

describe('DofWorkspaceLayout', () => {
  const items: WorkspaceNavItem[] = [
    { id: 'pulse', label: 'Pulse', icon: 'sparkles' },
    { id: 'catalog', label: 'Catalog', icon: 'package' },
    { id: 'offers', label: 'Offers', icon: 'flame' },
    { id: 'orders', label: 'Orders', icon: 'shopping-bag' },
    { id: 'people', label: 'People', icon: 'users' },
    { id: 'insights', label: 'Insights', icon: 'trending-up' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ]

  it('renders fixed-order nav with aria-current and emits navigate', async () => {
    const wrapper = mount(DofWorkspaceLayout, {
      props: { items: items.slice(0, 5), activeId: 'catalog', label: 'Workspace' },
      slots: { default: () => 'main' },
    })
    const sidebarButtons = wrapper.findAll('nav')[0]!.findAll('button')
    expect(sidebarButtons.map((b) => b.text())).toEqual(['Pulse', 'Catalog', 'Offers', 'Orders', 'People'])
    expect(sidebarButtons[1]!.attributes('aria-current')).toBe('page')
    await sidebarButtons[3]!.trigger('click')
    expect(wrapper.emitted('navigate')?.at(-1)).toEqual(['orders'])
  })

  it('tab bar honors the 5-slot budget: 7 items → 4 tabs + More (overflow sheet)', () => {
    const wrapper = mount(DofWorkspaceLayout, {
      props: { items, activeId: 'pulse', label: 'Workspace' },
      slots: { default: () => 'main' },
    })
    const tabBar = wrapper.findAll('nav')[1]!
    const labels = tabBar.findAll('button').map((b) => b.text())
    expect(labels).toEqual(['Pulse', 'Catalog', 'Offers', 'Orders', 'More'])
    expect(wrapper.find('a[href="#dof-main"]').text()).toBe(DS_MESSAGES.nav.skipToContent)
  })
})

describe('i18n catalog', () => {
  it('components read provided catalogs; English is the default', () => {
    const nl: DsMessages = structuredClone(DS_MESSAGES)
    // @ts-expect-error readonly shape cloned to mutable
    nl.common.retry = 'Opnieuw proberen'
    const host = defineComponent({
      setup() {
        provideDsMessages(nl)
        return () => h(DofProblem, { title: 'Mislukt.', retryable: true })
      },
    })
    const wrapper = mount(host)
    expect(wrapper.text()).toContain('Opnieuw proberen')

    const plain = mount(DofProblem, { props: { title: 'Failed.', retryable: true } })
    expect(plain.text()).toContain('Try again')
  })
})
