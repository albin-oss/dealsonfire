/**
 * Public SEO builders (VS 005) — pure unit tests: unfurl meta, canonical, JSON-LD shape,
 * absolute-URL discipline, and honest fallbacks (no image → summary card, no fake fields).
 */
import { describe, it, expect } from 'vitest'
import { productMeta, productJsonLd, productCanonical, storeMeta } from '../../app/composables/public-seo'

const facts = {
  origin: 'https://dof.dev',
  handle: 'rosas-knits',
  productId: '0198c5b2-0000-7000-8000-000000000001',
  title: 'Lavender baby blanket',
  description: 'Soft, warm, made slowly.',
  storeName: 'Rosa Knits',
  priceMinor: 4500,
  currency: 'EUR',
  imageUrl: 'https://blob.dof.dev/media/x/blanket.webp',
}

describe('productCanonical', () => {
  it('is the stable public URL', () => {
    expect(productCanonical(facts)).toBe('https://dof.dev/s/rosas-knits/p/0198c5b2-0000-7000-8000-000000000001')
  })
})

describe('productMeta (link unfurls)', () => {
  it('builds a large-image card when a photo exists', () => {
    const meta = productMeta(facts)
    expect(meta.ogTitle).toBe('Lavender baby blanket — Rosa Knits')
    expect(meta.ogImage).toBe(facts.imageUrl)
    expect(meta.twitterCard).toBe('summary_large_image')
    expect(meta.ogUrl).toBe(productCanonical(facts))
  })
  it('degrades honestly without a photo — summary card, no og:image at all', () => {
    const meta = productMeta({ ...facts, imageUrl: null })
    expect(meta.twitterCard).toBe('summary')
    expect('ogImage' in meta).toBe(false)
  })
  it('falls back to a store-attributed description', () => {
    const meta = productMeta({ ...facts, description: null })
    expect(meta.description).toBe('Lavender baby blanket — from Rosa Knits on DOF.')
  })
  it('makes relative image urls absolute', () => {
    const meta = productMeta({ ...facts, imageUrl: '/media/blanket.webp' })
    expect(meta.ogImage).toBe('https://dof.dev/media/blanket.webp')
  })
})

describe('productJsonLd (Schema.org)', () => {
  it('emits a valid Product with an Offer', () => {
    const ld = JSON.parse(productJsonLd(facts))
    expect(ld['@type']).toBe('Product')
    expect(ld.brand.name).toBe('Rosa Knits')
    expect(ld.offers).toMatchObject({ '@type': 'Offer', price: '45.00', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' })
  })
  it('omits the Offer entirely when there is no price — never a fabricated 0.00', () => {
    const ld = JSON.parse(productJsonLd({ ...facts, priceMinor: null }))
    expect('offers' in ld).toBe(false)
  })
})

describe('storeMeta', () => {
  it('uses the tagline, and the first product photo as the card image', () => {
    const meta = storeMeta({ origin: facts.origin, handle: facts.handle, storeName: 'Rosa Knits', tagline: 'Soft things, made slowly.', imageUrl: facts.imageUrl })
    expect(meta.ogDescription).toBe('Soft things, made slowly.')
    expect(meta.twitterCard).toBe('summary_large_image')
  })
})

describe('dealMeta (Release 0.3 — the promotion voice leads)', () => {
  const dealFacts = {
    origin: 'https://dof.dev', handle: 'rosas-knits', dealId: '0198c5b2-0000-7000-8000-000000000002',
    headline: 'This weekend: every blanket ships free', story: 'A short story.',
    storeName: 'Rosa Knits', productTitle: 'Lavender baby blanket', imageUrl: facts.imageUrl,
  }
  it('the headline is the hook; canonical is the deal URL', async () => {
    const { dealMeta, dealCanonical } = await import('../../app/composables/public-seo')
    const meta = dealMeta(dealFacts)
    expect(meta.ogTitle).toBe('This weekend: every blanket ships free — Rosa Knits')
    expect(meta.ogUrl).toBe('https://dof.dev/s/rosas-knits/d/0198c5b2-0000-7000-8000-000000000002')
    expect(dealCanonical(dealFacts)).toBe(meta.ogUrl)
    expect(meta.twitterCard).toBe('summary_large_image')
  })
  it('without a story, the description attributes the product to the store', async () => {
    const { dealMeta } = await import('../../app/composables/public-seo')
    const meta = dealMeta({ ...dealFacts, story: null })
    expect(meta.description).toBe('Lavender baby blanket — a deal from Rosa Knits on DOF.')
  })
})
