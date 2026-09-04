/**
 * ChangeHandle (SV-2) — the maker moves where their store lives on DOF. ADR §11: the
 * handle is "immutable-with-redirect-on-change" — the old address is never reused, it
 * redirects to the new one, so shared links, SEO, and order history never 404 and no one
 * can ever claim the old handle to inherit another store's reputation.
 *
 * Consequential (ADR §11: "handle changes → step-up authentication … always audit-logged
 * with before/after"): owner-only (`storefront.domain.write`) AND fresh step-up. The
 * aggregate refuses the change under an enforcement hold and from a store on its way out.
 *
 * Order within the transaction is contractual:
 *   1. validate + normalize the new handle (reserved-word/shape checked by the VO)
 *   2. aggregate gate (hold / status / same-handle) — cheap, no writes
 *   3. claim the new handle in the ledger (409 HANDLE_TAKEN on collision — race-safe)
 *   4. flip the old handle → redirect (+ flatten any existing redirect chain)
 *   5. persist the store's new handle, append the event, audit before/after
 */
import { type Result, ok, err } from '../../../../../shared/result'
import { type DomainError, domainError } from '../../../../../shared/errors'
import type { KernelDeps } from '../deps'
import { traceFromRequest } from '../trace'
import type { EntitlementService } from '../entitlement-service'
import { resolveAndAuthorize } from '../access'
import { asStoreId } from '../../../shared-kernel/ids'
import { createHandle } from '../../../shared-kernel/handle'
import type { Actor } from '../../../shared-kernel/actor'

export interface ChangeHandleInput {
  actor: Actor
  userId: string
  storeId: string
  handle: string
  stepUpVerified?: boolean
  requestContext?: Record<string, unknown>
}
export interface ChangeHandleOutput { storeId: string; handle: string }

export function changeHandleCommand(deps: KernelDeps, entitlements: EntitlementService) {
  return async (input: ChangeHandleInput): Promise<Result<ChangeHandleOutput, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const store = await deps.stores.findById(tx, asStoreId(input.storeId), { forUpdate: true })
      if (!store || store.status === 'deleted') return err(domainError('NOT_FOUND', 'store not found'))

      const access = await resolveAndAuthorize(deps, entitlements, tx, {
        actor: input.actor, userId: input.userId, businessId: store.businessId, storeId: store.id,
        stepUpVerified: input.stepUpVerified,
        spec: { command: 'merchant.store.change_handle', permission: 'storefront.domain.write', capability: 'store.core', sensitivity: 'sensitive' },
      })
      if (!access.ok) return err(access.error.code === 'NOT_FOUND' ? domainError('NOT_FOUND', 'store not found') : access.error)

      const next = createHandle(input.handle)
      if (!next.ok) return next
      const from = store.handle as string

      // Aggregate gate first (hold / status / same-handle) — reject before any ledger write.
      const changed = store.changeHandle(next.value, input.actor)
      if (!changed.ok) return changed

      // Claim the new handle atomically; a collision is a clean 409 (the store keeps the old
      // handle because the whole transaction rolls back on this error).
      const claimed = await deps.handles.claim(tx, next.value as string, store.id)
      if (!claimed) return err(domainError('HANDLE_TAKEN', 'that handle is taken'))

      // The old handle becomes a permanent redirect to the new one (never released).
      await deps.handles.redirectOnRename(tx, from, next.value as string)

      await deps.stores.update(tx, store)
      await deps.eventStore.append(tx, store.pullPendingEvents(), traceFromRequest(input.requestContext))
      await deps.audit.record(tx, {
        businessId: access.value.business.id, actor: input.actor, command: 'merchant.store.change_handle',
        sensitivity: 'sensitive', target: { type: 'store', id: store.id },
        beforeDigest: { handle: from }, afterDigest: { handle: next.value as string }, context: input.requestContext,
      })
      return ok({ storeId: store.id, handle: next.value as string })
    })
  }
}
