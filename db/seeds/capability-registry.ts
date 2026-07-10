/**
 * Capability Registry seed — BLUEPRINT-001 §5, verbatim.
 * The registry is data, reviewed like code (BLUEPRINT §9). Entries are versioned, never deleted.
 */
export interface CapabilitySeed {
  key: string
  description: string
  requiredTrustLevel: 'unverified' | 'identity_verified' | 'business_verified' | 'banking_verified'
  requiredScaleTier: 'starter' | 'growth' | 'established' | 'enterprise'
  requiredPermissions: string[]
  dependencies: string[]
  defaultAvailable: boolean
}

export const CAPABILITY_SEED: CapabilitySeed[] = [
  { key: 'ignite.flow', description: 'Run Ignite onboarding', requiredTrustLevel: 'unverified', requiredScaleTier: 'starter', requiredPermissions: [], dependencies: [], defaultAvailable: true },
  { key: 'store.core', description: 'Create/manage/publish one store', requiredTrustLevel: 'unverified', requiredScaleTier: 'starter', requiredPermissions: ['store.create', 'store.publish'], dependencies: [], defaultAvailable: true },
  { key: 'catalog.products', description: 'Products & variants', requiredTrustLevel: 'unverified', requiredScaleTier: 'starter', requiredPermissions: ['catalog.product.write'], dependencies: ['store.core'], defaultAvailable: true },
  { key: 'catalog.collections', description: 'Manual + smart collections', requiredTrustLevel: 'unverified', requiredScaleTier: 'starter', requiredPermissions: ['catalog.collection.write'], dependencies: ['catalog.products'], defaultAvailable: true },
  { key: 'catalog.inventory', description: 'Declared stock tracking', requiredTrustLevel: 'unverified', requiredScaleTier: 'starter', requiredPermissions: ['catalog.inventory.write'], dependencies: ['catalog.products'], defaultAvailable: true },
  { key: 'storefront.customize', description: 'Theme + storefront editing', requiredTrustLevel: 'unverified', requiredScaleTier: 'starter', requiredPermissions: ['storefront.write'], dependencies: ['store.core'], defaultAvailable: true },
  { key: 'offers.deals', description: 'Deals (flagship offer type)', requiredTrustLevel: 'unverified', requiredScaleTier: 'starter', requiredPermissions: ['offers.write'], dependencies: ['catalog.products'], defaultAvailable: true },
  { key: 'offers.coupons', description: 'Coupon codes', requiredTrustLevel: 'unverified', requiredScaleTier: 'starter', requiredPermissions: ['offers.write'], dependencies: ['catalog.products'], defaultAvailable: true },
  { key: 'selling.orders_view', description: 'Orders read model surface', requiredTrustLevel: 'unverified', requiredScaleTier: 'starter', requiredPermissions: ['orders.view'], dependencies: ['store.core'], defaultAvailable: true },
  { key: 'selling.payouts', description: 'Receive payouts (Commerce enforces via trust axis)', requiredTrustLevel: 'identity_verified', requiredScaleTier: 'starter', requiredPermissions: ['finance.payouts.view'], dependencies: ['selling.orders_view'], defaultAvailable: true },
  { key: 'ai.assistant', description: 'AI staff member, draft-only by default', requiredTrustLevel: 'unverified', requiredScaleTier: 'starter', requiredPermissions: ['ai.configure'], dependencies: ['store.core'], defaultAvailable: true },
  { key: 'offers.promotions', description: 'Store-wide promotions + scheduling', requiredTrustLevel: 'unverified', requiredScaleTier: 'growth', requiredPermissions: ['offers.write'], dependencies: ['offers.deals'], defaultAvailable: true },
  { key: 'analytics.advanced', description: 'Insights surface', requiredTrustLevel: 'unverified', requiredScaleTier: 'growth', requiredPermissions: ['analytics.view'], dependencies: ['store.core'], defaultAvailable: true },
  { key: 'seo.tools', description: 'SEO metadata tooling', requiredTrustLevel: 'unverified', requiredScaleTier: 'growth', requiredPermissions: ['storefront.write'], dependencies: ['storefront.customize'], defaultAvailable: true },
  { key: 'staff.manage', description: 'Invite/manage staff', requiredTrustLevel: 'identity_verified', requiredScaleTier: 'growth', requiredPermissions: ['staff.invite'], dependencies: ['store.core'], defaultAvailable: true },
  { key: 'stores.multiple', description: 'More than one store per business', requiredTrustLevel: 'business_verified', requiredScaleTier: 'established', requiredPermissions: ['store.create'], dependencies: ['store.core'], defaultAvailable: true },
  { key: 'catalog.shared', description: 'Business-level catalog across stores', requiredTrustLevel: 'business_verified', requiredScaleTier: 'established', requiredPermissions: ['catalog.product.write'], dependencies: ['stores.multiple'], defaultAvailable: true },
  { key: 'storefront.custom_domain', description: 'Custom domain binding', requiredTrustLevel: 'business_verified', requiredScaleTier: 'established', requiredPermissions: ['storefront.domain.write'], dependencies: ['storefront.customize'], defaultAvailable: true },
  { key: 'api.access', description: 'REST API keys + webhooks', requiredTrustLevel: 'business_verified', requiredScaleTier: 'established', requiredPermissions: ['developer.manage'], dependencies: [], defaultAvailable: false },
  // OPS-001 (CDC-001 §6/OPS-001-BLUEPRINT §6): multi-location is the Growth tier line.
  // The Ghost default location is system-authored and needs no capability; catalog.inventory
  // (above) is the pre-R-3 commerce-seam name, retained per registry law (never deleted).
  { key: 'ops.locations', description: 'Multiple locations (stores, warehouses, popups)', requiredTrustLevel: 'unverified', requiredScaleTier: 'growth', requiredPermissions: ['ops.location.write'], dependencies: ['store.core'], defaultAvailable: true },
  { key: 'org.enterprise', description: 'Org structures, custom roles, SLAs', requiredTrustLevel: 'banking_verified', requiredScaleTier: 'enterprise', requiredPermissions: [], dependencies: [], defaultAvailable: false },
]
