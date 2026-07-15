/**
 * Public SEO builders (VS 005). PURE: the product page and storefront hand these facts and
 * get back the head payload — link unfurls (OpenGraph/Twitter), canonical URLs, and
 * Schema.org JSON-LD. Future surfaces (Search, Deals, Sparks embeds) consume these
 * builders rather than inventing their own meta — one SEO voice for the platform.
 */
export interface ProductSeoFacts {
  origin: string
  handle: string
  productId: string
  title: string
  description: string | null
  storeName: string
  priceMinor: number | null
  currency: string | null
  imageUrl: string | null
}

export interface StoreSeoFacts {
  origin: string
  handle: string
  storeName: string
  tagline: string | null
  imageUrl: string | null
}

const absolute = (origin: string, url: string | null): string | null =>
  url === null ? null : url.startsWith('http') ? url : `${origin}${url}`

export function productCanonical(facts: Pick<ProductSeoFacts, 'origin' | 'handle' | 'productId'>): string {
  return `${facts.origin}/s/${facts.handle}/p/${facts.productId}`
}

export function productMeta(facts: ProductSeoFacts) {
  const description = facts.description ?? `${facts.title} — from ${facts.storeName} on DOF.`
  const image = absolute(facts.origin, facts.imageUrl)
  return {
    description,
    ogTitle: `${facts.title} — ${facts.storeName}`,
    ogDescription: description,
    // OG type stays 'website' (Nuxt's MetaFlat union; unfurlers treat unknown types as
    // website anyway) — the Product semantics live in the JSON-LD, which crawlers consume.
    ogType: 'website' as const,
    ogUrl: productCanonical(facts),
    ...(image ? { ogImage: image } : {}),
    twitterCard: (image ? 'summary_large_image' : 'summary') as 'summary_large_image' | 'summary',
    twitterTitle: `${facts.title} — ${facts.storeName}`,
    twitterDescription: description,
    ...(image ? { twitterImage: image } : {}),
  }
}

/** Schema.org Product JSON-LD. Availability is honest: a visible product is offerable
 *  (VISIBILITY_CONTRACT §1); stock granularity arrives with Inventory (CS2). */
export function productJsonLd(facts: ProductSeoFacts): string {
  const image = absolute(facts.origin, facts.imageUrl)
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: facts.title,
    ...(facts.description ? { description: facts.description } : {}),
    ...(image ? { image: [image] } : {}),
    url: productCanonical(facts),
    brand: { '@type': 'Brand', name: facts.storeName },
    ...(facts.priceMinor !== null
      ? {
          offers: {
            '@type': 'Offer',
            price: (facts.priceMinor / 100).toFixed(2),
            priceCurrency: facts.currency ?? 'EUR',
            availability: 'https://schema.org/InStock',
            url: productCanonical(facts),
            seller: { '@type': 'Organization', name: facts.storeName },
          },
        }
      : {}),
  })
}

export function storeMeta(facts: StoreSeoFacts) {
  const description = facts.tagline ?? `${facts.storeName} on DOF.`
  const image = absolute(facts.origin, facts.imageUrl)
  return {
    description,
    ogTitle: facts.storeName,
    ogDescription: description,
    ogType: 'website' as const,
    ogUrl: `${facts.origin}/s/${facts.handle}`,
    ...(image ? { ogImage: image } : {}),
    twitterCard: (image ? 'summary_large_image' : 'summary') as 'summary_large_image' | 'summary',
  }
}
