/**
 * Product DTO mapper — one shape for every command/query response (snake_case per the
 * contract convention). Includes computed readiness (never stored, ADR-002 §0.3).
 */
import type { Product } from '../domain/product'
import { checkProductReadiness } from '../domain/specifications/product-readiness-specification'

export interface ProductDTO {
  product_id: string
  business_id: string
  title: string
  description: { format: string; content: string } | null
  fulfillment_kind: string
  category_path: string | null
  status: string
  options: Array<{ name: string; values: string[] }>
  variants: Array<{
    variant_id: string
    sku: string
    option_values: Record<string, string>
    price: { amount: number; currency: string }
    sale: { amount: number; starts_at: string; ends_at: string } | null
    position: number
  }>
  media: Array<{
    product_media_id: string
    media_id: string
    variant_id: string | null
    role: string
    alt_text: string | null
    position: number
  }>
  ai_provenance: Record<string, unknown>
  readiness: { ready: boolean; missing: string[]; recommended: string[] }
}

export function productToDTO(product: Product): ProductDTO {
  return {
    product_id: product.id,
    business_id: product.businessId,
    title: product.title as string,
    description: product.description ? { format: product.description.format, content: product.description.content } : null,
    fulfillment_kind: product.fulfillmentKind,
    category_path: (product.categoryRef as string | null),
    status: product.status,
    options: product.options.map((o) => ({ name: o.name, values: [...o.values] as string[] })),
    variants: product.variants.map((v) => ({
      variant_id: v.id,
      sku: v.sku as string,
      option_values: { ...v.optionValues },
      price: { amount: v.price.amount, currency: v.price.currency },
      sale: v.sale
        ? { amount: v.sale.amount, starts_at: v.sale.startsAt.toISOString(), ends_at: v.sale.endsAt.toISOString() }
        : null,
      position: v.position,
    })),
    media: product.media.map((m) => ({
      product_media_id: m.id,
      media_id: m.media.mediaId as string,
      variant_id: m.variantId,
      role: m.role,
      alt_text: m.altText,
      position: m.position,
    })),
    ai_provenance: { ...product.aiProvenance },
    readiness: checkProductReadiness(product),
  }
}
