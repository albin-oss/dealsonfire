/**
 * Product Authoring engines (PROMPT-024) — pure unit tests: the conversational parser,
 * kind inference, category/description proposals, and the Readiness confidence model
 * (incl. the persona-driven rules: caps, honesty notes, the domain's own publish bar).
 */
import { describe, it, expect } from 'vitest'
import { parseLine, inferKind, suggestCategory, draftDescription } from '../../app/composables/authoring-intelligence'
import { productReadiness, type ReadinessDraft } from '../../app/composables/product-readiness'

describe('parseLine — the conversational opener', () => {
  it('extracts title + price across natural phrasings', () => {
    expect(parseLine('Lavender baby blanket, 45')).toEqual({ title: 'Lavender baby blanket', priceMinor: 4500 })
    expect(parseLine('Socks 12.50')).toEqual({ title: 'Socks', priceMinor: 1250 })
    expect(parseLine('Consulting call — €80')).toEqual({ title: 'Consulting call', priceMinor: 8000 })
    expect(parseLine('Mug 12,50')).toEqual({ title: 'Mug', priceMinor: 1250 })
  })
  it('keeps the whole line as title when no price is present', () => {
    expect(parseLine('Hand-thrown ceramic vase')).toEqual({ title: 'Hand-thrown ceramic vase', priceMinor: null })
    expect(parseLine('')).toEqual({ title: '', priceMinor: null })
  })
  it('never eats a numeric product name as a price', () => {
    // "No. 5" style trailing digits with a too-short title stay in the title
    expect(parseLine('5 45').priceMinor).toBeNull()
  })
})

describe('inferKind / suggestions — advisory intelligence', () => {
  it('reads digital and service signals; defaults to the business leaning', () => {
    expect(inferKind('Lightroom preset pack')).toBe('digital')
    expect(inferKind('Deep cleaning session')).toBe('service')
    expect(inferKind('Wool scarf')).toBe('physical')
    expect(inferKind('Wool scarf', 'service')).toBe('service') // leaning respected when no signal
  })
  it('suggests a category only when it actually knows', () => {
    expect(suggestCategory('Knitted wool blanket')).toBe('Home › Textiles')
    expect(suggestCategory('Mystery object')).toBeNull()
  })
  it('drafts one honest sentence per kind', () => {
    expect(draftDescription('Ebook of recipes', 'digital')).toContain('instantly')
    expect(draftDescription('Garden consult', 'service')).toContain('personally')
    expect(draftDescription('x', 'physical')).toBeNull() // too short to say anything honest
  })
})

describe('productReadiness — confidence, not completeness', () => {
  const base: ReadinessDraft = {
    title: 'Lavender blanket', priceMinor: 4500, kind: 'physical',
    categoryAccepted: false, descriptionAccepted: false, mediaCount: 0,
  }
  it('publishable = the domain bar (title + price), never more', () => {
    expect(productReadiness(base).publishable).toBe(true)
    expect(productReadiness({ ...base, priceMinor: null }).publishable).toBe(false)
    expect(productReadiness({ ...base, title: ' ' }).publishable).toBe(false)
  })
  it('secured facts carry a why; invitations are capped at two and never block', () => {
    const r = productReadiness(base)
    expect(r.items.filter((i) => i.state === 'invited').length).toBeLessThanOrEqual(2)
    for (const item of r.items) expect(item.why.length).toBeGreaterThan(10)
  })
  it('the digital persona gets an honest delivery note', () => {
    const r = productReadiness({ ...base, kind: 'digital', mediaCount: 1, descriptionAccepted: true })
    expect(r.items.some((i) => i.id === 'delivery' && i.state === 'invited')).toBe(true)
  })
  it('a photo moves from invitation to secured fact', () => {
    const before = productReadiness(base)
    const after = productReadiness({ ...base, mediaCount: 1 })
    expect(before.items.find((i) => i.id === 'photo')?.state).toBe('invited')
    expect(after.items.find((i) => i.id === 'photo')?.state).toBe('secured')
  })
  it('no urgency language anywhere', () => {
    for (const item of productReadiness(base).items) {
      expect(item.why).not.toMatch(/now!|hurry|missing|must|required/i)
    }
  })
})
