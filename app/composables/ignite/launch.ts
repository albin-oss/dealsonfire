/**
 * The launch saga, client side (UI-COM-002): Ignite creates REAL aggregates through
 * the kernel's public APIs — business → store (handle from the chosen name, one
 * retry on collision) → BrandKit → first product → publish. Narrated per step;
 * idempotency keys make retry safe; partial progress is kept so a retry resumes,
 * never re-creates. Fetch is injected — unit tests drive the saga without a server.
 */
import { slugify, type Fulfillment, type IdentityDraft } from './intelligence'
import type { IgniteState } from './journey'

export interface LaunchProgress {
  step: 'business' | 'store' | 'brand' | 'product' | 'publish'
  message: string
}

export interface LaunchResult {
  businessId: string
  storeId: string
  handle: string
  storeUrl: string
  productId: string | null
}

export type LaunchFetch = (path: string, options: {
  method: 'POST' | 'PUT'
  body: Record<string, unknown>
  headers: Record<string, string>
}) => Promise<Record<string, unknown>>

const DEV_USER_KEY = 'dof.dev-user-id'

/** Dev-identity user id (NUXT_IDENTITY_MODE=dev): stable per browser, minted once. */
export function devUserId(): string {
  if (typeof window === 'undefined') return crypto.randomUUID()
  let id = window.localStorage.getItem(DEV_USER_KEY)
  if (!id) {
    id = crypto.randomUUID()
    window.localStorage.setItem(DEV_USER_KEY, id)
  }
  return id
}

export class LaunchError extends Error {
  constructor(
    public readonly step: LaunchProgress['step'],
    message: string,
    public readonly retryable: boolean = true,
  ) {
    super(message)
  }
}

interface Partial_ {
  businessId?: string
  storeId?: string
  handle?: string
  storeUrl?: string
  productId?: string
  brandApplied?: boolean
}

export function createLaunchService(fetcher: LaunchFetch, userId: string = '') {
  const partial: Partial_ = {}

  function headers(): Record<string, string> {
    return {
      'x-dof-user-id': userId || devUserId(),
      'idempotency-key': crypto.randomUUID(),
    }
  }

  async function call(path: string, method: 'POST' | 'PUT', body: Record<string, unknown>, step: LaunchProgress['step']) {
    try {
      return await fetcher(path, { method, body, headers: headers() })
    } catch (error) {
      const detail = (error as { data?: { detail?: string } }).data?.detail
      throw new LaunchError(step, detail ?? 'We couldn’t reach DOF just now — nothing was lost, and trying again is safe.')
    }
  }

  async function launch(
    state: IgniteState,
    identity: IdentityDraft,
    fulfillment: Fulfillment,
    onProgress: (progress: LaunchProgress) => void,
  ): Promise<LaunchResult> {
    if (!partial.businessId) {
      onProgress({ step: 'business', message: 'Creating your business…' })
      const business = await call('/api/v1/businesses', 'POST', {
        display_name: identity.name,
        business_type: 'individual',
      }, 'business')
      partial.businessId = business.business_id as string
    }

    if (!partial.storeId) {
      onProgress({ step: 'store', message: `Opening ${identity.name}…` })
      // An explicit pick (availability suggestion) wins; otherwise derive from the name.
      const wanted = (state.handleOverride ?? '').trim() || slugify(identity.name)
      try {
        const store = await call(`/api/v1/businesses/${partial.businessId}/stores`, 'POST', {
          name: identity.name,
          handle: wanted,
        }, 'store')
        partial.storeId = store.store_id as string
        partial.handle = store.handle as string
      } catch (error) {
        // handle collision: one graceful retry with a suffix — collisions are
        // suggestions, never errors (frozen §9 failure paths)
        const store = await call(`/api/v1/businesses/${partial.businessId}/stores`, 'POST', {
          name: identity.name,
          handle: `${wanted.slice(0, 24)}-${Math.floor(Math.random() * 900 + 100)}`,
        }, 'store')
        partial.storeId = store.store_id as string
        partial.handle = store.handle as string
        void error
      }
    }

    if (!partial.brandApplied) {
      onProgress({ step: 'brand', message: 'Dressing it in your colors…' })
      await call(`/api/v1/stores/${partial.storeId}/brand-kit`, 'PUT', {
        name: identity.name,
        palette: { primary: identity.palette.primary, surface: identity.palette.surface, text: identity.palette.text },
        voice: { tone: identity.voice },
      }, 'brand')
      partial.brandApplied = true
    }

    if (!partial.productId && state.productTitle.trim() !== '' && state.priceMinor !== null) {
      onProgress({ step: 'product', message: `Putting “${state.productTitle}” on the shelf…` })
      const product = await call('/api/v1/products', 'POST', {
        business_id: partial.businessId,
        title: state.productTitle.trim(),
        fulfillment_kind: fulfillment,
        default_price: { amount: state.priceMinor, currency: 'EUR' },
        publish_to_store_id: partial.storeId, // VISIBILITY_CONTRACT: the shelf is listing truth now
      }, 'product')
      partial.productId = product.product_id as string
    }

    onProgress({ step: 'publish', message: 'Opening the doors…' })
    const published = await call(`/api/v1/stores/${partial.storeId}/publish`, 'POST', {}, 'publish')

    return {
      businessId: partial.businessId!,
      storeId: partial.storeId!,
      handle: partial.handle!,
      storeUrl: (published.store_url as string | undefined) ?? `/${partial.handle}`,
      productId: partial.productId ?? null,
    }
  }

  return { launch }
}
