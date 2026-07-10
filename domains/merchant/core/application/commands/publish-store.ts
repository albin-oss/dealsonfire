/**
 * PublishStore (BLUEPRINT §4) — Draft/Paused → Live. Restricted standing blocks publishing
 * (growth op); enforcement hold answers 423 before readiness answers 409 (Store aggregate).
 * store.published is THE celebratory event: Community seeds a launch Spark from it (ADR §9).
 */
import { type Result, ok, err } from '../../../../../shared/result'
import type { DomainError } from '../../../../../shared/errors'
import { domainError } from '../../../../../shared/errors'
import type { KernelDeps } from '../deps'
import { traceFromRequest } from '../trace'
import type { EntitlementService } from '../entitlement-service'
import { resolveAndAuthorize } from '../access'
import { asStoreId } from '../../../shared-kernel/ids'
import type { Actor } from '../../../shared-kernel/actor'
import { GROWTH_BLOCKING_STANDINGS } from '../../../shared-kernel/trust'

export interface PublishStoreInput {
  actor: Actor
  userId: string
  storeId: string
  stepUpVerified?: boolean
  requestContext?: Record<string, unknown>
}

export interface PublishStoreOutput {
  storeId: string
  status: string
  publishedAt: string | null
  storeUrl: string
}

export function publishStoreCommand(deps: KernelDeps, entitlements: EntitlementService) {
  return async (input: PublishStoreInput): Promise<Result<PublishStoreOutput, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const store = await deps.stores.findById(tx, asStoreId(input.storeId), { forUpdate: true })
      if (!store || store.status === 'deleted') return err(domainError('NOT_FOUND', 'store not found'))

      const access = await resolveAndAuthorize(deps, entitlements, tx, {
        actor: input.actor,
        userId: input.userId,
        businessId: store.businessId,
        storeId: store.id,
        stepUpVerified: input.stepUpVerified,
        spec: {
          command: 'merchant.store.publish',
          permission: 'store.publish',
          capability: 'store.core',
          blockedStandings: GROWTH_BLOCKING_STANDINGS,
        },
      })
      if (!access.ok) {
        const masked = access.error.code === 'NOT_FOUND'
        return err(masked ? domainError('NOT_FOUND', 'store not found') : access.error)
      }
      const { business } = access.value

      const storedKit = await deps.brandKits.findByOwner(tx, 'store', store.id)
      const listings = await deps.listingReadiness.forStore(tx, store.id)

      const published = store.publish(
        {
          name: store.name,
          hasBrandKit: storedKit !== null,
          hasPolicies: Object.keys(store.policies).length > 0,
          listings,
        },
        input.actor,
        storedKit ? { name: storedKit.brandKit.name, palette: { ...storedKit.brandKit.palette } } : null,
      )
      if (!published.ok) return published

      await deps.stores.update(tx, store)
      await deps.eventStore.append(tx, store.pullPendingEvents(), traceFromRequest(input.requestContext))

      await deps.audit.record(tx, {
        businessId: business.id,
        actor: input.actor,
        command: 'merchant.store.publish',
        sensitivity: 'normal',
        target: { type: 'store', id: store.id },
        afterDigest: { status: store.status, handle: store.handle },
        context: input.requestContext,
      })

      return ok({
        storeId: store.id,
        status: store.status,
        publishedAt: store.publishedAt?.toISOString() ?? null,
        storeUrl: `/s/${store.handle}`,
      })
    })
  }
}
