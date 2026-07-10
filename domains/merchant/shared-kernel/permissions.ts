/**
 * RBAC: atomic permissions, role bundles, grant modes (BLUEPRINT-001 §6).
 * Grant modes: full > draft (may create drafts, never publish/execute) > read.
 * Moderator/Administrator are NOT merchant roles — they act via the Administration
 * domain's command API and deliberately do not exist in this matrix (ADR-001 §12.2).
 */

export const PERMISSIONS = [
  'store.view',
  'store.create',
  'store.publish',
  'store.pause_resume',
  'storefront.write',
  'storefront.brand.write',
  'storefront.domain.write',
  'catalog.product.write',
  'catalog.collection.write',
  'catalog.inventory.write',
  'catalog.listing.write',
  'ops.location.write',
  'offers.write',
  'orders.view',
  'finance.payouts.view',
  'finance.payout_config',
  'staff.invite',
  'staff.manage_roles',
  'business.profile.write',
  'business.verification.submit',
  'business.transfer',
  'business.close',
  'analytics.view',
  'ai.configure',
  'audit.view',
  'developer.manage',
] as const
export type Permission = (typeof PERMISSIONS)[number]

export const ROLES = ['owner', 'manager', 'staff', 'support_agent', 'ai_assistant'] as const
export type Role = (typeof ROLES)[number]

export type GrantMode = 'read' | 'draft' | 'full'
const MODE_RANK: Record<GrantMode, number> = { read: 0, draft: 1, full: 2 }

type Grants = Partial<Record<Permission, GrantMode>>

/** BLUEPRINT-001 §6, kernel subset. AI hard guardrails (no money, no staffing, no
 *  destructive ops — ADR §13.3) are ABSENT entries here: the gate cannot be configured around them. */
export const ROLE_PERMISSIONS: Record<Role, Grants> = {
  owner: Object.fromEntries(PERMISSIONS.map((p) => [p, 'full'])) as Grants,
  manager: {
    'store.view': 'full', 'store.create': 'full', 'store.publish': 'full', 'store.pause_resume': 'full',
    'storefront.write': 'full', 'storefront.brand.write': 'full',
    'catalog.product.write': 'full', 'catalog.collection.write': 'full',
    'catalog.inventory.write': 'full', 'catalog.listing.write': 'full',
    'ops.location.write': 'full',
    'offers.write': 'full', 'orders.view': 'full',
    'finance.payouts.view': 'read',
    'business.profile.write': 'full', 'business.verification.submit': 'full',
    'analytics.view': 'full', 'ai.configure': 'full', 'audit.view': 'full',
  },
  staff: {
    'store.view': 'full',
    'catalog.product.write': 'full', 'catalog.collection.write': 'full',
    'catalog.inventory.write': 'full', 'catalog.listing.write': 'full',
    'orders.view': 'full',
  },
  support_agent: {
    // Time-boxed, consent-based, fully audited (membership.expires_at enforces the box)
    'store.view': 'read',
    'storefront.write': 'draft', 'storefront.brand.write': 'draft',
    'catalog.product.write': 'draft', 'catalog.collection.write': 'draft', 'catalog.listing.write': 'draft',
    'orders.view': 'read',
  },
  ai_assistant: {
    'store.view': 'read',
    'storefront.write': 'draft', 'storefront.brand.write': 'draft',
    'catalog.product.write': 'draft', 'catalog.collection.write': 'draft', 'catalog.listing.write': 'draft',
    'offers.write': 'draft', // may draft offers; NEVER changes prices autonomously (ADR §13.3)
    'orders.view': 'read',
    'business.profile.write': 'draft',
  },
}

/** Highest grant mode any of the given roles provides for a permission. */
export function grantFor(roles: readonly string[], permission: Permission): GrantMode | null {
  let best: GrantMode | null = null
  for (const role of roles) {
    const mode = ROLE_PERMISSIONS[role as Role]?.[permission]
    if (mode && (best === null || MODE_RANK[mode] > MODE_RANK[best])) best = mode
  }
  return best
}

export function grantSatisfies(granted: GrantMode | null, required: GrantMode): boolean {
  return granted !== null && MODE_RANK[granted] >= MODE_RANK[required]
}
