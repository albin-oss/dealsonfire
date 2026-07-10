/**
 * GetProduct / ListProducts queries (IMP-COM-001B) — merchant-scoped reads. GetProduct
 * masks cross-tenant probes as NOT_FOUND (kernel law); ListProducts is a keyset-paginated
 * tenant grid (direct query per the D-13 reasoning; projection when analytics enrich it).
 * Read authorization: 'store.view' permission — every merchant role holds it.
 */
import { type Result, ok, err } from '../../../../../shared/result'
import { domainError, type DomainError } from '../../../../../shared/errors'
import type { Actor } from '../../../../merchant/shared-kernel/actor'
import { asBusinessId } from '../../../../merchant/shared-kernel/ids'
import { asProductId } from '../../../shared-kernel/ids'
import { authorize } from '../../../../merchant/shared-kernel/command-gate'
import type { ProductStatus } from '../../domain/value-objects'
import type { Page } from '../../../../../platform/pagination'
import type { ProductGridRow } from '../../infrastructure/product-read-dao'
import { productToDTO, type ProductDTO } from '../dto'
import type { CommerceDeps } from '../ports'

const READ_SPEC = { command: 'commerce.product.read', permission: 'store.view' as const, mode: 'read' as const, capability: 'catalog.products' }

export function getProductQuery(deps: CommerceDeps) {
  return async (input: { userId: string; actor: Actor; productId: string }): Promise<Result<ProductDTO, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const product = await deps.products.findById(tx, asProductId(input.productId))
      if (!product) return err(domainError('NOT_FOUND', 'product not found'))
      const access = await deps.merchantAccess.resolveAccess(tx, input.userId, product.businessId)
      if (!access.ok) return err(domainError('NOT_FOUND', 'product not found')) // masking
      const gate = authorize(
        { actor: input.actor, membership: access.value.membership, business: access.value.business, effectiveCapabilities: access.value.capabilities },
        READ_SPEC,
      )
      if (!gate.ok) return gate
      return ok(productToDTO(product))
    })
  }
}

export function listProductsQuery(deps: CommerceDeps) {
  return async (input: {
    userId: string
    actor: Actor
    businessId: string
    status?: ProductStatus
    showArchived?: boolean
    q?: string
    limit: number
    cursor: string | null
  }): Promise<Result<Page<ProductGridRow>, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const access = await deps.merchantAccess.resolveAccess(tx, input.userId, input.businessId)
      if (!access.ok) return access
      const gate = authorize(
        { actor: input.actor, membership: access.value.membership, business: access.value.business, effectiveCapabilities: access.value.capabilities },
        READ_SPEC,
      )
      if (!gate.ok) return gate
      return deps.productReads.list(tx, asBusinessId(input.businessId), {
        status: input.status,
        showArchived: input.showArchived,
        q: input.q,
        limit: input.limit,
        cursor: input.cursor,
      })
    })
  }
}
