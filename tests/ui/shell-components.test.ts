/** Command registry + DofAskBar + DofBreadcrumbs — the shell's DS substrate. */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { registerCommands, listCommands, type SearchProvider } from '@ds/patterns/composables/commands'
import DofAskBar from '@ds/patterns/components/dof-ask-bar.vue'
import DofBreadcrumbs from '@ds/primitives/dof-breadcrumbs.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('command registry', () => {
  it('registers, lists in order, releases, and conflict-checks ids', () => {
    const a = registerCommands([{ id: 'x.one', label: 'One', group: 'G', run: () => {} }])
    expect(() => registerCommands([{ id: 'x.one', label: 'Dup', group: 'G', run: () => {} }]))
      .toThrow(/conflict/)
    const b = registerCommands([{ id: 'x.two', label: 'Two', group: 'G', run: () => {} }])
    expect(listCommands().map((c) => c.id)).toEqual(['x.one', 'x.two'])
    a.release()
    expect(listCommands().map((c) => c.id)).toEqual(['x.two'])
    b.release()
  })
})

describe('DofAskBar', () => {
  function mountBar(props: Record<string, unknown> = {}) {
    return mount(DofAskBar, { props: { open: true, ...props }, attachTo: document.body })
  }

  it('shows recents before typing; folded narrowing filters commands', async () => {
    const reg = registerCommands([
      { id: 't.products', label: 'Go to Products', group: 'Go to', run: () => {} },
      { id: 't.cafe', label: 'Go to Café goods', group: 'Go to', run: () => {} },
    ])
    const wrapper = mountBar({ recentSearches: ['lavender'] })
    await nextTick()
    const body = document.body
    expect(body.textContent).toContain('Recent')
    expect(body.textContent).toContain('lavender')

    const input = body.querySelector('input')!
    input.value = 'cafe'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    expect(body.textContent).toContain('Café goods')
    expect(body.textContent).not.toContain('Go to Products')
    wrapper.unmount()
    reg.release()
  })

  it('Enter runs the active row and records the search', async () => {
    const ran = vi.fn()
    const searched = vi.fn()
    const reg = registerCommands([{ id: 't.deal', label: 'Start a deal', group: 'Actions', run: ran }])
    const wrapper = mountBar({ onSearch: searched })
    await nextTick()
    const input = document.body.querySelector('input')!
    input.value = 'deal'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()
    expect(ran).toHaveBeenCalledOnce()
    expect(searched).toHaveBeenCalledWith('deal')
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    wrapper.unmount()
    reg.release()
  })

  it('provider seam: async results render under the provider heading', async () => {
    const provider: SearchProvider = {
      id: 'p', label: 'Products', search: async () => [{ id: '1', label: 'Lavender Soap', run: () => {} }],
    }
    const wrapper = mountBar({ providers: [provider] })
    await nextTick()
    const input = document.body.querySelector('input')!
    input.value = 'lav'
    input.dispatchEvent(new Event('input'))
    await vi.waitFor(() => expect(document.body.textContent).toContain('Lavender Soap'))
    wrapper.unmount()
  })
})

describe('DofBreadcrumbs', () => {
  it('marks the last crumb current; earlier crumbs navigate', async () => {
    const wrapper = mount(DofBreadcrumbs, {
      props: { items: [{ id: 'home', label: 'Home' }, { id: 'products', label: 'Products' }] },
    })
    expect(wrapper.get('[aria-current="page"]').text()).toBe('Products')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('navigate')?.at(-1)).toEqual(['home'])
  })
})
