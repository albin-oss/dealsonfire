/** Ignite engine: intelligence rules, CSV adapter, launch saga (injected fetch). */
import { describe, it, expect } from 'vitest'
import { ruleBasedIntelligence, slugify } from '../../app/composables/ignite/intelligence'
import { parseProductsCsv, IMPORT_SOURCES } from '../../app/composables/ignite/import-sources'
import { createLaunchService, LaunchError, type LaunchFetch } from '../../app/composables/ignite/launch'
import { initialIgniteState, chosenIdentity } from '../../app/composables/ignite/journey'

describe('ruleBasedIntelligence', () => {
  it('reads categories from merchant words; the fallback is honest about guessing', () => {
    const knit = ruleBasedIntelligence.readIdea('my knitted baby blankets')
    expect(knit).toMatchObject({ category: 'Handmade & Home', fulfillment: 'physical', matched: true, subject: 'blankets' })

    const digital = ruleBasedIntelligence.readIdea('lightroom presets for photographers')
    expect(digital).toMatchObject({ category: 'Digital Goods', fulfillment: 'digital', matched: true })

    const mystery = ruleBasedIntelligence.readIdea('zorblax phenomena')
    expect(mystery.matched).toBe(false) // drives confidence 'estimate' in the reveal
  })

  it('drafts exactly three deterministic identities with valid handles and #rrggbb palettes', () => {
    const a = ruleBasedIntelligence.draftIdentities('my knitted baby blankets')
    const b = ruleBasedIntelligence.draftIdentities('my knitted baby blankets')
    expect(a).toEqual(b) // deterministic — the Mirror never shuffles under the merchant
    expect(a).toHaveLength(3)
    for (const identity of a) {
      expect(identity.handle).toMatch(/^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/) // kernel HANDLE_PATTERN
      expect(identity.palette.primary).toMatch(/^#[0-9a-f]{6}$/) // BrandKit contract
    }
    expect(new Set(a.map((i) => i.name)).size).toBe(3)
  })

  it('reveal plans adapt to fulfillment: shipping only for physical, delivery for digital', () => {
    const physical = ruleBasedIntelligence.draftReveal(
      ruleBasedIntelligence.readIdea('handmade soap'),
      ruleBasedIntelligence.draftIdentities('handmade soap')[0]!,
    )
    expect(physical.map((i) => i.id)).toContain('shipping')

    const digital = ruleBasedIntelligence.draftReveal(
      ruleBasedIntelligence.readIdea('ebook templates'),
      ruleBasedIntelligence.draftIdentities('ebook templates')[0]!,
    )
    expect(digital.map((i) => i.id)).toContain('delivery')
    expect(digital.map((i) => i.id)).not.toContain('shipping')
    // returns are two-step everywhere (displayed → binding after review)
    expect(digital.find((i) => i.id === 'returns')!.detail).toContain('binding only after you review')
  })

  it('slugify satisfies the kernel handle pattern for awkward names', () => {
    for (const name of ['Café & Co.', 'The Blanket Studio', 'ÅåÖö', 'A B', '——']) {
      expect(slugify(name)).toMatch(/^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/)
    }
  })
})

describe('parseProductsCsv', () => {
  it('finds title/price columns, converts to minor units, skips titleless rows', () => {
    const csv = 'Name,Price,Notes\n"Lavender Soap","14.99",lovely\nRose Soap,€12,ok\n,9.99,orphan\nBeeswax Candle,,none'
    const { products, skipped } = parseProductsCsv(csv)
    expect(products).toEqual([
      { title: 'Lavender Soap', priceMinor: 1499 },
      { title: 'Rose Soap', priceMinor: 1200 },
      { title: 'Beeswax Candle', priceMinor: null },
    ])
    expect(skipped).toBe(1)
  })

  it('handles semicolon delimiters and quoted commas', () => {
    const csv = 'title;price\n"Blanket, small";24,50'
    const { products } = parseProductsCsv(csv)
    expect(products).toEqual([{ title: 'Blanket, small', priceMinor: 2450 }])
  })

  it('is honest when no title column exists', () => {
    const { products, skipped } = parseProductsCsv('sku,amount\nX1,3')
    expect(products).toEqual([])
    expect(skipped).toBe(1)
  })

  it('capability matrix: files are ready, platforms are honestly pending', () => {
    expect(IMPORT_SOURCES.filter((s) => s.available).map((s) => s.id)).toEqual(['csv', 'excel'])
    expect(IMPORT_SOURCES).toHaveLength(9)
  })
})

describe('launch saga', () => {
  function makeState() {
    const state = initialIgniteState()
    state.idea = 'handmade soap'
    state.identities = ruleBasedIntelligence.draftIdentities(state.idea)
    state.identityIndex = 0
    state.productTitle = 'Lavender Soap'
    state.priceMinor = 1499
    return state
  }

  it('runs business → store → brand → product → publish with narration', async () => {
    const calls: string[] = []
    const fetcher: LaunchFetch = async (path) => {
      calls.push(path)
      if (path === '/api/v1/businesses') return { business_id: 'b1' }
      if (path.endsWith('/stores')) return { store_id: 's1', handle: 'soap-co' }
      if (path.endsWith('/publish')) return { store_url: 'https://dof.dev/soap-co' }
      if (path === '/api/v1/products') return { product_id: 'p1' }
      return {}
    }
    const service = createLaunchService(fetcher, 'user-1')
    const steps: string[] = []
    const state = makeState()
    const result = await service.launch(state, chosenIdentity(state)!, 'physical', (p) => steps.push(p.step))

    expect(result).toEqual({ businessId: 'b1', storeId: 's1', handle: 'soap-co', storeUrl: 'https://dof.dev/soap-co', productId: 'p1' })
    expect(steps).toEqual(['business', 'store', 'brand', 'product', 'publish'])
    expect(calls).toEqual([
      '/api/v1/businesses',
      '/api/v1/businesses/b1/stores',
      '/api/v1/stores/s1/brand-kit',
      '/api/v1/products',
      '/api/v1/stores/s1/publish',
    ])
  })

  it('a handle collision retries once with a suffix', async () => {
    let storeAttempts = 0
    const handles: string[] = []
    const fetcher: LaunchFetch = async (path, options) => {
      if (path === '/api/v1/businesses') return { business_id: 'b1' }
      if (path.endsWith('/stores')) {
        storeAttempts++
        handles.push(options.body.handle as string)
        if (storeAttempts === 1) throw Object.assign(new Error('taken'), { data: { detail: 'HANDLE_TAKEN' } })
        return { store_id: 's1', handle: options.body.handle }
      }
      if (path.endsWith('/publish')) return {}
      return { product_id: 'p1' }
    }
    const service = createLaunchService(fetcher, 'user-1')
    const state = makeState()
    const result = await service.launch(state, chosenIdentity(state)!, 'physical', () => {})
    expect(storeAttempts).toBe(2)
    expect(handles[1]).toMatch(/-\d{3}$/)
    expect(result.storeId).toBe('s1')
  })

  it('a mid-saga failure surfaces an educating LaunchError and retry RESUMES (no duplicate business)', async () => {
    let businessCalls = 0
    let failProduct = true
    const fetcher: LaunchFetch = async (path) => {
      if (path === '/api/v1/businesses') { businessCalls++; return { business_id: 'b1' } }
      if (path.endsWith('/stores')) return { store_id: 's1', handle: 'h' }
      if (path === '/api/v1/products') {
        if (failProduct) { failProduct = false; throw Object.assign(new Error('down'), { data: { detail: 'db unreachable' } }) }
        return { product_id: 'p1' }
      }
      if (path.endsWith('/publish')) return {}
      return {}
    }
    const service = createLaunchService(fetcher, 'user-1')
    const state = makeState()
    const identity = chosenIdentity(state)!

    const failure = await service.launch(state, identity, 'physical', () => {}).then(() => null, (e: unknown) => e)
    expect(failure).toBeInstanceOf(LaunchError)
    expect((failure as LaunchError).step).toBe('product')
    expect((failure as LaunchError).message).toBe('db unreachable')

    const result = await service.launch(state, identity, 'physical', () => {})
    expect(businessCalls).toBe(1) // partial progress kept — nothing re-created
    expect(result.productId).toBe('p1')
  })

  it('devUserId is stable per browser', async () => {
    const { devUserId } = await import('../../app/composables/ignite/launch')
    expect(devUserId()).toBe(devUserId())
  })
})
