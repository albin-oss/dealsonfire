/**
 * Attribute-set + brand-ref queries (PROMPT-016). Read-only, business-scoped, gated by
 * membership (the caller's business is resolved before the read).
 */
import { type Result, ok } from '../../../../../shared/result'
import type { DomainError } from '../../../../../shared/errors'
import type { Actor } from '../../../../merchant/shared-kernel/actor'
import { asBusinessId } from '../../../../merchant/shared-kernel/ids'
import { withAuthorizedBusiness } from '../access'
import type { CommerceDeps } from '../ports'

const READ_SPEC = { permission: 'store.view', mode: 'read', capability: 'catalog.products' } as const

export function listAttributeSetsQuery(deps: CommerceDeps) {
  return async (input: { userId: string; actor: Actor; businessId: string }): Promise<Result<Array<{ id: string; name: string; definitions: unknown[]; status: string }>, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const access = await withAuthorizedBusiness(deps, tx, { userId: input.userId, actor: input.actor, businessId: input.businessId, spec: { command: 'commerce.attribute_set.list', ...READ_SPEC } })
      if (!access.ok) return access
      return ok(await deps.attributeSets.listByBusiness(tx, asBusinessId(input.businessId)))
    })
  }
}

export function listBrandRefsQuery(deps: CommerceDeps) {
  return async (input: { userId: string; actor: Actor; businessId: string }): Promise<Result<Array<{ id: string; name: string }>, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const access = await withAuthorizedBusiness(deps, tx, { userId: input.userId, actor: input.actor, businessId: input.businessId, spec: { command: 'commerce.brand_ref.list', ...READ_SPEC } })
      if (!access.ok) return access
      return ok(await deps.brandRefs.listByBusiness(tx, asBusinessId(input.businessId)))
    })
  }
}
