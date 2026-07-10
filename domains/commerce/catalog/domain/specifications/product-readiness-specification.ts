/**
 * ProductReadinessSpecification (ADR-002 §0.3/§5): "Ready" is COMPUTED, never stored —
 * a stored flag can drift; a spec cannot. The bar is deliberately Ignite-low (Five-Minute
 * Store Principle): title + ≥1 variant + a price on every variant; media is RECOMMENDED
 * (reported separately), never required — the kernel's explainable-missing-list shape.
 */
import type { Product } from '../product'

export interface ProductReadiness {
  ready: boolean
  /** Explainable blockers — the publish button renders this list inline, never a dead end. */
  missing: string[]
  /** Non-blocking suggestions (Pulse/completion-score inputs). */
  recommended: string[]
}

export function checkProductReadiness(product: Product): ProductReadiness {
  const missing: string[] = []
  const recommended: string[] = []

  if (product.status === 'archived') missing.push('product is archived — restore it first')
  if (product.variants.length === 0) missing.push('at least one variant')
  // Prices are structurally guaranteed per variant (Money VO is required at creation);
  // a zero price is legal (free products exist) but worth flagging:
  if (product.variants.some((v) => v.price.amount === 0)) recommended.push('a non-zero price (currently free)')
  if (product.media.length === 0) recommended.push('at least one photo — listings with photos convert dramatically better')
  if (!product.description) recommended.push('a description')
  if (!product.categoryRef) recommended.push('a category')

  return { ready: missing.length === 0, missing, recommended }
}
