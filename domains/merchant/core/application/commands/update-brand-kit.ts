/**
 * UpdateBrandKit (BLUEPRINT §4) — whole-value PUT replace (BrandKit is a VO, never PATCHed).
 * Emits store.brand_kit_updated on the Store aggregate stream; audit carries a name-level diff.
 */
import { type Result, ok, err } from '../../../../../shared/result'
import type { DomainError } from '../../../../../shared/errors'
import { domainError } from '../../../../../shared/errors'
import type { KernelDeps } from '../deps'
import { traceFromRequest } from '../trace'
import type { EntitlementService } from '../entitlement-service'
import { resolveAndAuthorize } from '../access'
import { createBrandKit, type BrandKitInput } from '../../../shared-kernel/brand-kit'
import { asStoreId } from '../../../shared-kernel/ids'
import type { Actor } from '../../../shared-kernel/actor'
import { EVENT, makeEvent } from '../../domain/events'

export interface UpdateBrandKitInput {
  actor: Actor
  userId: string
  storeId: string
  brandKit: BrandKitInput
  stepUpVerified?: boolean
  requestContext?: Record<string, unknown>
}

export interface UpdateBrandKitOutput {
  storeId: string
  name: string
  palette: Record<string, string>
  typography: Record<string, string>
  voice: Record<string, unknown>
  logoMediaId: string | null
}

export function updateBrandKitCommand(deps: KernelDeps, entitlements: EntitlementService) {
  return async (input: UpdateBrandKitInput): Promise<Result<UpdateBrandKitOutput, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const store = await deps.stores.findById(tx, asStoreId(input.storeId), { forUpdate: true })
      if (!store || store.status === 'deleted') return err(domainError('NOT_FOUND', 'store not found'))

      const access = await resolveAndAuthorize(deps, entitlements, tx, {
        actor: input.actor,
        userId: input.userId,
        businessId: store.businessId,
        storeId: store.id,
        stepUpVerified: input.stepUpVerified,
        spec: { command: 'merchant.store.brand_kit.update', permission: 'storefront.brand.write', capability: 'store.core' },
      })
      if (!access.ok) {
        // Membership/business failures mask as store-not-found only for cross-tenant probes:
        const masked = access.error.code === 'NOT_FOUND'
        return err(masked ? domainError('NOT_FOUND', 'store not found') : access.error)
      }
      const { business } = access.value

      const kit = createBrandKit(input.brandKit)
      if (!kit.ok) return kit

      const previous = await deps.brandKits.findByOwner(tx, 'store', store.id)
      await deps.brandKits.upsert(tx, {
        brandKit: kit.value,
        ownerType: 'store',
        ownerId: store.id,
        businessId: business.id,
      })

      await deps.eventStore.append(tx, [
        makeEvent(EVENT.STORE_BRAND_KIT_UPDATED, { type: 'store', id: store.id }, business.id, input.actor, {
          store_id: store.id, business_id: business.id, name: kit.value.name,
        }),
      ], traceFromRequest(input.requestContext))

      await deps.audit.record(tx, {
        businessId: business.id,
        actor: input.actor,
        command: 'merchant.store.brand_kit.update',
        sensitivity: 'normal',
        target: { type: 'store', id: store.id },
        beforeDigest: { name: previous?.brandKit.name ?? null },
        afterDigest: { name: kit.value.name },
        context: input.requestContext,
      })

      return ok({
        storeId: store.id,
        name: kit.value.name,
        palette: { ...kit.value.palette },
        typography: { ...kit.value.typography },
        voice: { ...kit.value.voice },
        logoMediaId: kit.value.logoMediaId,
      })
    })
  }
}
