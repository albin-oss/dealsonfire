/**
 * ArchiveProduct / RestoreProduct (IMP-COM-001B). Archive is idempotent (no event on
 * re-archive — kernel idiom); restore lands on active (D-28b).
 */
import { type Result, ok } from '../../../../../shared/result'
import type { DomainError } from '../../../../../shared/errors'
import { traceFromRequest } from '../../../../../platform/trace'
import type { Actor } from '../../../../merchant/shared-kernel/actor'
import type { Product } from '../../domain/product'
import { withAuthorizedProduct } from '../access'
import { productToDTO, type ProductDTO } from '../dto'
import type { CommerceDeps } from '../ports'

interface LifecycleCommand {
  actor: Actor
  userId: string
  productId: string
  requestContext?: Record<string, unknown>
}

function lifecycle(deps: CommerceDeps, command: string, act: (p: Product, a: Actor) => Result<void, DomainError>) {
  return async (input: LifecycleCommand): Promise<Result<ProductDTO, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const authorized = await withAuthorizedProduct(deps, tx, {
        userId: input.userId, actor: input.actor, productId: input.productId,
        spec: { command, permission: 'catalog.product.write', capability: 'catalog.products' },
      })
      if (!authorized.ok) return authorized
      const { product } = authorized.value

      const acted = act(product, input.actor)
      if (!acted.ok) return acted

      const events = product.pullPendingEvents()
      if (events.length > 0) {
        await deps.products.update(tx, product)
        await deps.eventStore.append(tx, events, traceFromRequest(input.requestContext))
        await deps.audit.record(tx, {
          businessId: product.businessId, actor: input.actor, command, sensitivity: 'normal',
          target: { type: 'product', id: product.id },
          afterDigest: { status: product.status },
          context: input.requestContext,
        })
      }
      return ok(productToDTO(product))
    })
  }
}

export const archiveProductCommand = (deps: CommerceDeps) =>
  lifecycle(deps, 'commerce.product.archive', (product, actor) => product.archive(actor))

export const restoreProductCommand = (deps: CommerceDeps) =>
  lifecycle(deps, 'commerce.product.restore', (product, actor) => product.restore(actor))
