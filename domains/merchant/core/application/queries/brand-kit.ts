/**
 * GET brand kit (Release 0.5) — the merchant's own identity read, for the Store
 * Identity editor. Masked resolution (cross-tenant probes see store-not-found);
 * a store without a kit answers an empty one (the editor teaches from blank).
 */
import { type Result, ok, err } from '../../../../../shared/result'
import { domainError, type DomainError } from '../../../../../shared/errors'
import type { KernelDeps } from '../deps'
import type { EntitlementService } from '../entitlement-service'
import { resolveAndAuthorize } from '../access'
import { asStoreId } from '../../../shared-kernel/ids'
import type { Actor } from '../../../shared-kernel/actor'
import type { BrandKit } from '../../../shared-kernel/brand-kit'

export interface GetBrandKitInput {
  actor: Actor
  userId: string
  storeId: string
}

export interface GetBrandKitOutput {
  storeId: string
  name: string
  logoMediaId: string | null
  palette: Record<string, string>
  typography: Record<string, string>
  voice: BrandKit['voice']
}

export function getBrandKitQuery(deps: KernelDeps, entitlements: EntitlementService) {
  return async (input: GetBrandKitInput): Promise<Result<GetBrandKitOutput, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const store = await deps.stores.findById(tx, asStoreId(input.storeId))
      if (!store || store.status === 'deleted') return err(domainError('NOT_FOUND', 'store not found'))

      const access = await resolveAndAuthorize(deps, entitlements, tx, {
        actor: input.actor,
        userId: input.userId,
        businessId: store.businessId,
        storeId: store.id,
        spec: { command: 'merchant.store.brand_kit.read', permission: 'store.view', capability: 'store.core', mode: 'read' },
      })
      if (!access.ok) {
        const masked = access.error.code === 'NOT_FOUND'
        return err(masked ? domainError('NOT_FOUND', 'store not found') : access.error)
      }

      const kit = await deps.brandKits.findByOwner(tx, 'store', store.id)
      return ok({
        storeId: store.id,
        name: kit?.brandKit.name ?? store.name,
        logoMediaId: kit?.brandKit.logoMediaId ?? null,
        palette: { ...(kit?.brandKit.palette ?? {}) },
        typography: { ...(kit?.brandKit.typography ?? {}) },
        voice: kit?.brandKit.voice ?? {},
      })
    })
  }
}
