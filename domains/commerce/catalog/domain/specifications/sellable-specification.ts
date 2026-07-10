/**
 * SellableSpecification (ADR-002 §2 "Availability"): can THIS variant be bought NOW?
 * The full conjunction spans modules that do not exist yet (listings, inventory) — those
 * inputs arrive through nullable context per the D-03 port pattern: `null` = module
 * absent, clause skipped; a boolean/number = module present, clause enforced. When the
 * publishing and inventory sprints land, their adapters flip the inputs from null to
 * real values and this spec needs NO change.
 * Time is a parameter (sale windows) — the spec never samples the clock (kernel law).
 */
import type { Product } from '../product'
import type { VariantId } from '../../../shared-kernel/ids'

export interface SellableContext {
  /** null until the publishing subdomain provides it (listing published + visibility). */
  listingPublished: boolean | null
  /** null until the inventory subdomain provides it (available = on_hand − reserved). */
  availableInventory: number | null
  now: Date
}

export interface SellableResult {
  sellable: boolean
  reasons: string[]
}

export function checkSellable(product: Product, variantId: VariantId, context: SellableContext): SellableResult {
  const reasons: string[] = []

  if (product.status !== 'active') reasons.push(`product is ${product.status}, not active`)
  const variant = product.variants.find((v) => v.id === variantId)
  if (!variant) {
    return { sellable: false, reasons: ['variant does not exist on this product'] }
  }
  if (context.listingPublished === false) reasons.push('listing is not published')
  if (context.availableInventory !== null && context.availableInventory <= 0) reasons.push('out of stock')
  // Sanity: an active sale must be coherent at `now` (defense against corrupt rehydration)
  const effective = variant.effectiveAmount(context.now)
  if (effective < 0) reasons.push('effective price is invalid')

  return { sellable: reasons.length === 0, reasons }
}
