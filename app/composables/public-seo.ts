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

export function storeMeta(facts: StoreSeoFacts & { title?: string | null }) {
  const description = facts.tagline ?? `${facts.storeName} on DOF.`
  const image = absolute(facts.origin, facts.imageUrl)
  // a shop introduces itself with its one-liner, not just its name (Release 1.1)
  const title = facts.title ? `${facts.storeName} — ${facts.title}` : facts.storeName
  return {
    description,
    ogTitle: title,
    ogDescription: description,
    ogType: 'website' as const,
    ogUrl: `${facts.origin}/s/${facts.handle}`,
    ...(image ? { ogImage: image } : {}),
    twitterCard: (image ? 'summary_large_image' : 'summary') as 'summary_large_image' | 'summary',
    twitterTitle: title,
    twitterDescription: description,
    ...(image ? { twitterImage: image } : {}),
  }
}

export interface DealSeoFacts {
  origin: string
  handle: string
  dealId: string
  headline: string
  story: string | null
  storeName: string
  productTitle: string
  imageUrl: string | null
}

export function dealCanonical(facts: Pick<DealSeoFacts, 'origin' | 'handle' | 'dealId'>): string {
  return `${facts.origin}/s/${facts.handle}/d/${facts.dealId}`
}

/** Deal unfurls lead with the PROMOTION voice — the headline is the hook. */
export function dealMeta(facts: DealSeoFacts) {
  const description = facts.story ?? `${facts.productTitle} — a deal from ${facts.storeName} on DOF.`
  const image = absolute(facts.origin, facts.imageUrl)
  return {
    description,
    ogTitle: `${facts.headline} — ${facts.storeName}`,
    ogDescription: description,
    ogType: 'website' as const,
    ogUrl: dealCanonical(facts),
    ...(image ? { ogImage: image } : {}),
    twitterCard: (image ? 'summary_large_image' : 'summary') as 'summary_large_image' | 'summary',
    twitterTitle: `${facts.headline} — ${facts.storeName}`,
    twitterDescription: description,
    ...(image ? { twitterImage: image } : {}),
  }
}

export interface SparkSeoFacts {
  origin: string
  handle: string
  sparkId: string
  body: string
  storeName: string
  imageUrl: string | null
}

export function sparkCanonical(facts: Pick<SparkSeoFacts, 'origin' | 'handle' | 'sparkId'>): string {
  return `${facts.origin}/s/${facts.handle}/sparks/${facts.sparkId}`
}

/** Spark unfurls: the update IS the message — body excerpt as the card. */
export function sparkMeta(facts: SparkSeoFacts) {
  const excerpt = facts.body.length > 160 ? `${facts.body.slice(0, 157)}…` : facts.body
  const image = absolute(facts.origin, facts.imageUrl)
  return {
    description: excerpt,
    ogTitle: `${facts.storeName} on DOF`,
    ogDescription: excerpt,
    ogType: 'website' as const,
    ogUrl: sparkCanonical(facts),
    ...(image ? { ogImage: image } : {}),
    twitterCard: (image ? 'summary_large_image' : 'summary') as 'summary_large_image' | 'summary',
    twitterTitle: `${facts.storeName} on DOF`,
    twitterDescription: excerpt,
    ...(image ? { twitterImage: image } : {}),
  }
}

// ————————————————————————————————————————————— LS-8: the street, findable

/** Organization + WebSite (+ a truthful SearchAction — /search is real). One per site, on /home. */
export function siteJsonLd(origin: string): string {
  return JSON.stringify([
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'DOF',
      description: 'A street of independent shops — their deals, updates, and stories.',
      url: origin,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'DOF',
      url: origin,
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${origin}/search?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
  ])
}

/** The shop as an Organization — name, the maker's own words, canonical URL. Nothing invented. */
export function storeJsonLd(facts: StoreSeoFacts & { story?: string | null }): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: facts.storeName,
    ...(facts.story || facts.tagline ? { description: facts.story ?? facts.tagline } : {}),
    url: `${facts.origin}/s/${facts.handle}`,
    ...(facts.imageUrl ? { image: absolute(facts.origin, facts.imageUrl) } : {}),
  })
}

/** ItemList for enumeration surfaces (/shops, non-empty lanes). */
export function itemListJsonLd(origin: string, listUrl: string, items: Array<{ name: string; url: string }>): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    url: `${origin}${listUrl}`,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem', position: i + 1, name: item.name, url: `${origin}${item.url}`,
    })),
  })
}

export function laneCanonical(origin: string, laneId: string): string {
  return `${origin}/street/${laneId}`
}

export function laneMeta(facts: { origin: string; laneId: string; title: string; blurb: string }) {
  return {
    description: facts.blurb,
    ogTitle: `${facts.title} — DOF`,
    ogDescription: facts.blurb,
    ogType: 'website' as const,
    ogUrl: laneCanonical(facts.origin, facts.laneId),
    twitterCard: 'summary' as const,
    twitterTitle: `${facts.title} — DOF`,
    twitterDescription: facts.blurb,
  }
}
