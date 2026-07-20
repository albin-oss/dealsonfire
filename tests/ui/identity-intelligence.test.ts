/** Identity drafts (Release 0.5) — advisory, deterministic, honest about blank context. */
import { describe, it, expect } from 'vitest'
import { draftStory, draftPromises } from '../../app/composables/identity-intelligence'

describe('draftStory', () => {
  it('weaves the store name, shelf, and tagline into a starting point', () => {
    const draft = draftStory({ storeName: 'Rosa Knits', tagline: 'Soft things, made slowly', productTitles: ['Lavender blanket', 'Wool scarf'] })
    expect(draft).toContain('Rosa Knits')
    expect(draft).toContain('lavender blanket and wool scarf')
    expect(draft).toContain('Soft things, made slowly.')
    expect(draft!.length).toBeLessThanOrEqual(500)
  })
  it('is honest with an empty shelf and no tagline', () => {
    const draft = draftStory({ storeName: 'Rosa Knits', tagline: null, productTitles: [] })
    expect(draft).toContain('what we sell')
    expect(draft).not.toContain('undefined')
  })
  it('says nothing without a store name', () => {
    expect(draftStory({ storeName: '  ', tagline: null, productTitles: [] })).toBeNull()
  })
})

describe('draftPromises', () => {
  it('offers short promises that fit the 120-character contract limit', () => {
    const drafts = draftPromises({ storeName: 'Rosa Knits', tagline: null, productTitles: ['Blanket'] })
    expect(drafts.length).toBeGreaterThanOrEqual(3)
    for (const d of drafts) expect(d.length).toBeLessThanOrEqual(120)
  })
})
