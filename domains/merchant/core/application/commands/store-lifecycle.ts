/**
 * Store lifecycle commands (SV-1) — the merchant owns whether their store is open.
 * pause/close/restore mirror publish-store.ts: resolve+authorize (masked NOT_FOUND),
 * mutate the aggregate, persist, append the domain event, audit. Reopen reuses
 * publishStore (Paused → Live, STORE_RESUMED) and is not duplicated here.
 *
 * Authorization: pause/reopen need `store.pause_resume` (owner+manager); the consequential
 * close/restore need `store.close` (owner-only) AND fresh step-up. Enforcement holds are
 * untouched — a held store still cannot publish, and these transitions never clear a hold.
 */
import { type Result, ok, err } from '../../../../../shared/result'
import { type DomainError, domainError } from '../../../../../shared/errors'
import type { KernelDeps } from '../deps'
import { traceFromRequest } from '../trace'
import type { EntitlementService } from '../entitlement-service'
import { resolveAndAuthorize } from '../access'
import { asStoreId } from '../../../shared-kernel/ids'
import type { Actor } from '../../../shared-kernel/actor'
import type { PauseReason } from '../../domain/store'

export interface LifecycleInput {
  actor: Actor
  userId: string
  storeId: string
  stepUpVerified?: boolean
  requestContext?: Record<string, unknown>
}
export interface PauseInput extends LifecycleInput { reason: PauseReason; backOn?: string | null }
export interface LifecycleOutput { storeId: string; status: string; restoreDaysLeft: number | null }

const REOPENABLE_FROM_CLOSED = 'closed'

export function pauseStoreCommand(deps: KernelDeps, entitlements: EntitlementService) {
  return async (input: PauseInput): Promise<Result<LifecycleOutput, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const store = await deps.stores.findById(tx, asStoreId(input.storeId), { forUpdate: true })
      if (!store || store.status === 'deleted') return err(domainError('NOT_FOUND', 'store not found'))
      const access = await resolveAndAuthorize(deps, entitlements, tx, {
        actor: input.actor, userId: input.userId, businessId: store.businessId, storeId: store.id,
        stepUpVerified: input.stepUpVerified,
        spec: { command: 'merchant.store.pause', permission: 'store.pause_resume', capability: 'store.core' },
      })
      if (!access.ok) return err(access.error.code === 'NOT_FOUND' ? domainError('NOT_FOUND', 'store not found') : access.error)

      const done = store.pause(input.reason, input.backOn ?? null, input.actor)
      if (!done.ok) return done
      await deps.stores.update(tx, store)
      await deps.eventStore.append(tx, store.pullPendingEvents(), traceFromRequest(input.requestContext))
      await deps.audit.record(tx, {
        businessId: access.value.business.id, actor: input.actor, command: 'merchant.store.pause',
        sensitivity: 'normal', target: { type: 'store', id: store.id },
        afterDigest: { status: store.status, reason: input.reason }, context: input.requestContext,
      })
      return ok({ storeId: store.id, status: store.status, restoreDaysLeft: store.restoreDaysLeft })
    })
  }
}

export function closeStoreCommand(deps: KernelDeps, entitlements: EntitlementService) {
  return async (input: LifecycleInput): Promise<Result<LifecycleOutput, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const store = await deps.stores.findById(tx, asStoreId(input.storeId), { forUpdate: true })
      if (!store || store.status === 'deleted') return err(domainError('NOT_FOUND', 'store not found'))
      const access = await resolveAndAuthorize(deps, entitlements, tx, {
        actor: input.actor, userId: input.userId, businessId: store.businessId, storeId: store.id,
        stepUpVerified: input.stepUpVerified,
        spec: { command: 'merchant.store.close', permission: 'store.close', capability: 'store.core', sensitivity: 'sensitive' },
      })
      if (!access.ok) return err(access.error.code === 'NOT_FOUND' ? domainError('NOT_FOUND', 'store not found') : access.error)

      const done = store.close(input.actor)
      if (!done.ok) return done
      await deps.stores.update(tx, store)
      await deps.eventStore.append(tx, store.pullPendingEvents(), traceFromRequest(input.requestContext))
      await deps.audit.record(tx, {
        businessId: access.value.business.id, actor: input.actor, command: 'merchant.store.close',
        sensitivity: 'sensitive', target: { type: 'store', id: store.id },
        afterDigest: { status: store.status, closed_at: store.closedAt?.toISOString() ?? null }, context: input.requestContext,
      })
      return ok({ storeId: store.id, status: store.status, restoreDaysLeft: store.restoreDaysLeft })
    })
  }
}

export function restoreStoreCommand(deps: KernelDeps, entitlements: EntitlementService) {
  return async (input: LifecycleInput): Promise<Result<LifecycleOutput, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const store = await deps.stores.findById(tx, asStoreId(input.storeId), { forUpdate: true })
      if (!store || store.status === 'deleted') return err(domainError('NOT_FOUND', 'store not found'))
      if (store.status !== REOPENABLE_FROM_CLOSED) return err(domainError('INVALID_TRANSITION', 'only a closed store can be restored'))
      const access = await resolveAndAuthorize(deps, entitlements, tx, {
        actor: input.actor, userId: input.userId, businessId: store.businessId, storeId: store.id,
        stepUpVerified: input.stepUpVerified,
        spec: { command: 'merchant.store.restore', permission: 'store.close', capability: 'store.core', sensitivity: 'sensitive' },
      })
      if (!access.ok) return err(access.error.code === 'NOT_FOUND' ? domainError('NOT_FOUND', 'store not found') : access.error)

      const done = store.restore(input.actor)
      if (!done.ok) return done
      await deps.stores.update(tx, store)
      await deps.eventStore.append(tx, store.pullPendingEvents(), traceFromRequest(input.requestContext))
      await deps.audit.record(tx, {
        businessId: access.value.business.id, actor: input.actor, command: 'merchant.store.restore',
        sensitivity: 'sensitive', target: { type: 'store', id: store.id },
        afterDigest: { status: store.status }, context: input.requestContext,
      })
      return ok({ storeId: store.id, status: store.status, restoreDaysLeft: store.restoreDaysLeft })
    })
  }
}
