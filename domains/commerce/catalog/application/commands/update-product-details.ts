/**
 * UpdateProductDetails — the ATOMIC composite behind PATCH /products/{id}: any combination
 * of title/description/category applied in ONE transaction (a bad category must not leave
 * a half-applied rename — PgUnitOfWork rolls back on err Results). RenameProduct,
 * UpdateDescription, and SetCategory are the named single-field doors over the same core.
 */
import { type Result, ok } from '../../../../../shared/result'
import type { DomainError } from '../../../../../shared/errors'
import { traceFromRequest } from '../../../../../platform/trace'
import type { Actor } from '../../../../merchant/shared-kernel/actor'
import { withAuthorizedProduct } from '../access'
import { productToDTO, type ProductDTO } from '../dto'
import type { CommerceDeps } from '../ports'

export interface UpdateProductDetailsCommand {
  actor: Actor
  userId: string
  productId: string
  /** undefined = untouched; null = clear (description/category only). */
  title?: string
  description?: { format?: 'plain' | 'markdown'; content: string } | null
  categoryRef?: string | null
  requestContext?: Record<string, unknown>
}

export function updateProductDetailsCommand(deps: CommerceDeps) {
  return async (input: UpdateProductDetailsCommand): Promise<Result<ProductDTO, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const authorized = await withAuthorizedProduct(deps, tx, {
        userId: input.userId,
        actor: input.actor,
        productId: input.productId,
        spec: { command: 'commerce.product.update', permission: 'catalog.product.write', capability: 'catalog.products' },
      })
      if (!authorized.ok) return authorized
      const { product } = authorized.value

      const fields: string[] = []
      if (input.title !== undefined) {
        const renamed = product.rename(input.title, input.actor)
        if (!renamed.ok) return renamed
        fields.push('title')
      }
      if (input.description !== undefined) {
        const updated = product.updateDescription(input.description, input.actor)
        if (!updated.ok) return updated
        fields.push('description')
      }
      if (input.categoryRef !== undefined) {
        const set = product.setCategory(input.categoryRef, input.actor)
        if (!set.ok) return set
        fields.push('category')
      }

      const events = product.pullPendingEvents()
      if (events.length > 0) {
        await deps.products.update(tx, product)
        await deps.eventStore.append(tx, events, traceFromRequest(input.requestContext))
        await deps.audit.record(tx, {
          businessId: product.businessId,
          actor: input.actor,
          command: 'commerce.product.update',
          sensitivity: 'normal',
          target: { type: 'product', id: product.id },
          afterDigest: { fields_requested: fields },
          context: input.requestContext,
        })
      }
      return ok(productToDTO(product))
    })
  }
}

/** Named single-field handlers (IMP-COM-001B command list) — doors over the composite. */
export const renameProductCommand = (deps: CommerceDeps) =>
  (input: Omit<UpdateProductDetailsCommand, 'description' | 'categoryRef'> & { title: string }) =>
    updateProductDetailsCommand(deps)(input)

export const updateDescriptionCommand = (deps: CommerceDeps) =>
  (input: Omit<UpdateProductDetailsCommand, 'title' | 'categoryRef'> & { description: UpdateProductDetailsCommand['description'] }) =>
    updateProductDetailsCommand(deps)(input)

export const setCategoryCommand = (deps: CommerceDeps) =>
  (input: Omit<UpdateProductDetailsCommand, 'title' | 'description'> & { categoryRef: string | null }) =>
    updateProductDetailsCommand(deps)(input)
