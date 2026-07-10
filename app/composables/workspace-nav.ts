/**
 * Workspace NavSchema (UI-COM-001 §3) — navigation is DATA (DESIGN-SYSTEM-001 §4):
 * fixed order, gated by Surface Level (ADR-005 §6). The brief's fourteen modules are
 * all here; what a merchant SEES honors the noun budget — S0 shows exactly five
 * (D-36 documents the reconciliation). Capability gating joins when merchant
 * sessions reach the client; Surface Level is the presentation axis and ships now.
 */
import type { WorkspaceNavItem, IconName } from '@ds/index'

export type SurfaceLevel = 's0' | 's1' | 's2' | 's3'
export const SURFACE_LEVELS: SurfaceLevel[] = ['s0', 's1', 's2', 's3']

export interface WorkspaceModule extends WorkspaceNavItem {
  /** Route path for the module. */
  to: string
  /** First surface level at which the module reveals (ADR-005 §6.1). */
  reveal: SurfaceLevel
  /** One-sentence promise for the coming-soon page (empty states teach). */
  promise: string
  /** Why it's worth it, in merchant language. */
  why: string
  icon: IconName
}

/** Fixed order — items appear and retreat with Surface Level, never reorder. */
export const WORKSPACE_MODULES: WorkspaceModule[] = [
  { id: 'home', label: 'Home', icon: 'sparkles', to: '/', reveal: 's0', promise: 'Your Pulse — what needs you, what could grow.', why: 'One calm feed instead of a wall of dashboards.' },
  { id: 'products', label: 'Products', icon: 'package', to: '/products', reveal: 's0', promise: 'Your catalog: show a photo, Ignite drafts the rest.', why: 'Camera-first product creation lands here first.' },
  { id: 'orders', label: 'Orders', icon: 'shopping-bag', to: '/orders', reveal: 's0', promise: 'A short to-do list with money attached.', why: 'Needs-action first; packing runs when volume grows.' },
  { id: 'deals', label: 'Deals', icon: 'flame', to: '/deals', reveal: 's0', promise: 'Generosity with a clock that tells the truth.', why: 'Stores running deals get 3× the visits.' },
  { id: 'customers', label: 'Customers', icon: 'users', to: '/customers', reveal: 's1', promise: 'The people who came back — and why.', why: 'Repeat customers are the truest sign it’s working.' },
  { id: 'coupons', label: 'Coupons', icon: 'tag', to: '/coupons', reveal: 's1', promise: 'Gifts with your customer’s name on them.', why: 'One-tap redemption, never a code scavenger hunt.' },
  { id: 'store', label: 'Store', icon: 'store', to: '/store', reveal: 's1', promise: 'Your storefront, wearing your brand — not ours.', why: 'The merchant is the hero; DOF is the gallery.' },
  { id: 'inventory', label: 'Inventory', icon: 'layers', to: '/inventory', reveal: 's2', promise: 'Counts where your products are; corrections as one-line stories.', why: 'Appears when tracking starts earning its keep.' },
  { id: 'shipping', label: 'Shipping', icon: 'truck', to: '/shipping', reveal: 's2', promise: 'Promises to customers, kept — labels in one tap.', why: 'You tune outcomes; DOF maintains the tables.' },
  { id: 'returns', label: 'Returns', icon: 'rotate-ccw', to: '/returns', reveal: 's2', promise: 'Fair decisions with the evidence assembled.', why: 'Handled generously, a return keeps the customer.' },
  { id: 'sparks', label: 'Sparks', icon: 'message-circle', to: '/sparks', reveal: 's2', promise: 'The conversations around your store.', why: 'Every launch, drop, and milestone can be a story.' },
  { id: 'marketing', label: 'Marketing', icon: 'send', to: '/marketing', reveal: 's3', promise: 'Reach the people rooting for you.', why: 'Audience first, campaigns second.' },
  { id: 'analytics', label: 'Analytics', icon: 'trending-up', to: '/analytics', reveal: 's3', promise: 'Sentences before charts.', why: '“Twice your usual Tuesday” beats a wall of KPIs.' },
  { id: 'settings', label: 'Settings', icon: 'settings', to: '/settings', reveal: 's0', promise: 'Store, business, and account — three doors, clearly split.', why: 'Nothing in here is ever required to start selling.' },
]

const surfaceRank: Record<SurfaceLevel, number> = { s0: 0, s1: 1, s2: 2, s3: 3 }

export function modulesForSurface(level: SurfaceLevel): WorkspaceModule[] {
  return WORKSPACE_MODULES.filter((m) => surfaceRank[m.reveal] <= surfaceRank[level])
}

export function moduleByPath(path: string): WorkspaceModule | undefined {
  return WORKSPACE_MODULES.find((m) => m.to === path)
}

const STORAGE_KEY = 'dof.surface-level'

/** Per-person Surface Level (ADR-005 §6: presentation, not entitlement). Persisted locally. */
export function useSurfaceLevel() {
  const level = useState<SurfaceLevel>('surface-level', () => 's0')

  if (import.meta.client) {
    const stored = window.localStorage.getItem(STORAGE_KEY) as SurfaceLevel | null
    if (stored && SURFACE_LEVELS.includes(stored)) level.value = stored
    watch(level, (value) => window.localStorage.setItem(STORAGE_KEY, value))
  }

  return { level, levels: SURFACE_LEVELS }
}
