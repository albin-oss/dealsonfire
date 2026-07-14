/**
 * Commerce branded identifiers (BLUEPRINT-002 §1). Cross-domain identity types
 * (BusinessId, MediaId) come from the merchant shared-kernel — the platform's frozen
 * identity contracts (ADR-003 F5); commerce brands only what commerce owns.
 */
import { uuidv7, isUuid } from '../../../platform/uuid'

declare const brand: unique symbol
type Branded<T, B extends string> = T & { readonly [brand]: B }

export type ProductId = Branded<string, 'ProductId'>
export type VariantId = Branded<string, 'VariantId'>
export type ProductMediaId = Branded<string, 'ProductMediaId'>
export type AttributeSetId = Branded<string, 'AttributeSetId'>
export type BrandRefId = Branded<string, 'BrandRefId'>

function make<T extends string>(value?: string): T {
  const v = value ?? uuidv7()
  if (!isUuid(v)) throw new TypeError(`invalid uuid: ${v}`)
  return v as T
}

export const newProductId = () => make<ProductId>()
export const newVariantId = () => make<VariantId>()
export const newProductMediaId = () => make<ProductMediaId>()

export const asProductId = (v: string) => make<ProductId>(v)
export const asVariantId = (v: string) => make<VariantId>(v)
export const asProductMediaId = (v: string) => make<ProductMediaId>(v)

export const newAttributeSetId = () => make<AttributeSetId>()
export const asAttributeSetId = (v: string) => make<AttributeSetId>(v)
export const newBrandRefId = () => make<BrandRefId>()
export const asBrandRefId = (v: string) => make<BrandRefId>(v)
