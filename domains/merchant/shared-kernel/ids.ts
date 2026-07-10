/**
 * Branded identifier types (BLUEPRINT-001 §1 shared-kernel).
 * A BusinessId can never be passed where a StoreId is expected — the compiler is the first gate.
 */
import { uuidv7, isUuid } from './uuid'

declare const brand: unique symbol
export type Branded<T, B extends string> = T & { readonly [brand]: B }

export type UserId = Branded<string, 'UserId'>
export type MerchantId = Branded<string, 'MerchantId'>
export type BusinessId = Branded<string, 'BusinessId'>
export type StoreId = Branded<string, 'StoreId'>
export type BrandKitId = Branded<string, 'BrandKitId'>
export type StorefrontConfigId = Branded<string, 'StorefrontConfigId'>
export type MembershipId = Branded<string, 'MembershipId'>
export type EventId = Branded<string, 'EventId'>
export type MediaId = Branded<string, 'MediaId'>

function make<T extends string>(value?: string): T {
  const v = value ?? uuidv7()
  if (!isUuid(v)) throw new TypeError(`invalid uuid: ${v}`)
  return v as T
}

export const newMerchantId = () => make<MerchantId>()
export const newBusinessId = () => make<BusinessId>()
export const newStoreId = () => make<StoreId>()
export const newBrandKitId = () => make<BrandKitId>()
export const newStorefrontConfigId = () => make<StorefrontConfigId>()
export const newMembershipId = () => make<MembershipId>()
export const newEventId = () => make<EventId>()

export const asUserId = (v: string) => make<UserId>(v)
export const asMerchantId = (v: string) => make<MerchantId>(v)
export const asBusinessId = (v: string) => make<BusinessId>(v)
export const asStoreId = (v: string) => make<StoreId>(v)
export const asBrandKitId = (v: string) => make<BrandKitId>(v)
export const asMembershipId = (v: string) => make<MembershipId>(v)
export const asEventId = (v: string) => make<EventId>(v)
export const asMediaId = (v: string) => make<MediaId>(v)
