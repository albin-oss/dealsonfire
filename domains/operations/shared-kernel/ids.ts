/**
 * Operations branded ids (OPS-001 Batch 1 scope only — StockItemId et al. arrive with
 * their aggregates, per the no-future-placeholder rule). Mirrors the commerce pattern.
 */

declare const brand: unique symbol
type Branded<T, B> = T & { readonly [brand]: B }

export type LocationId = Branded<string, 'LocationId'>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function asLocationId(value: string): LocationId {
  if (!UUID_RE.test(value)) throw new Error(`invalid LocationId: ${value}`)
  return value as LocationId
}
