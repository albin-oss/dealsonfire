/**
 * AddMedia / RemoveMedia / ReorderMedia (IMP-COM-001B). Explicit handlers over one
 * private executor — no generic gymnastics; each command keeps its precise input type.
 */
import { type Result, ok } from '../../../../../shared/result'
import type { DomainError } from '../../../../../shared/errors'
import { traceFromRequest } from '../../../../../platform/trace'
import type { Actor } from '../../../../merchant/shared-kernel/actor'
import { asProductMediaId, asVariantId } from '../../../shared-kernel/ids'
import type { Product } from '../../domain/product'
import { withAuthorizedProduct } from '../access'
import { productToDTO, type ProductDTO } from '../dto'
import type { CommerceDeps } from '../ports'

interface MediaCommandBase {
  actor: Actor
  userId: string
  productId: string
  requestContext?: Record<string, unknown>
}

async function execute(
  deps: CommerceDeps,
  input: MediaCommandBase,
  command: string,
  act: (product: Product) => Result<unknown, DomainError>,
): Promise<Result<ProductDTO, DomainError>> {
  return deps.uow.withTransaction(async (tx) => {
    const authorized = await withAuthorizedProduct(deps, tx, {
      userId: input.userId,
      actor: input.actor,
      productId: input.productId,
      spec: { command, permission: 'catalog.product.write', capability: 'catalog.products' },
    })
    if (!authorized.ok) return authorized
    const { product } = authorized.value

    const acted = act(product)
    if (!acted.ok) return acted

    const events = product.pullPendingEvents()
    if (events.length > 0) { // D-29: silent no-ops persist and audit nothing
      await deps.products.update(tx, product)
      await deps.eventStore.append(tx, events, traceFromRequest(input.requestContext))
      await deps.audit.record(tx, {
        businessId: product.businessId,
        actor: input.actor,
        command,
        sensitivity: 'normal',
        target: { type: 'product', id: product.id },
        afterDigest: { media_count: product.media.length },
        context: input.requestContext,
      })
    }
    return ok(productToDTO(product))
  })
}

export interface AddMediaCommand extends MediaCommandBase {
  mediaId: string
  variantId?: string | null
  role?: 'gallery' | 'hero' | 'swatch'
  altText?: string | null
}

export function addMediaCommand(deps: CommerceDeps) {
  return (input: AddMediaCommand): Promise<Result<ProductDTO, DomainError>> =>
    execute(deps, input, 'commerce.product.media_add', (product) =>
      product.addMedia({
        mediaId: input.mediaId,
        variantId: input.variantId ? asVariantId(input.variantId) : null,
        role: input.role,
        altText: input.altText,
      }, input.actor))
}

export interface RemoveMediaCommand extends MediaCommandBase {
  productMediaId: string
}

export function removeMediaCommand(deps: CommerceDeps) {
  return (input: RemoveMediaCommand): Promise<Result<ProductDTO, DomainError>> =>
    execute(deps, input, 'commerce.product.media_remove', (product) =>
      product.removeMedia(asProductMediaId(input.productMediaId), input.actor))
}

export interface ReorderMediaCommand extends MediaCommandBase {
  orderedIds: string[]
}

export function reorderMediaCommand(deps: CommerceDeps) {
  return (input: ReorderMediaCommand): Promise<Result<ProductDTO, DomainError>> =>
    execute(deps, input, 'commerce.product.media_reorder', (product) =>
      product.reorderMedia(input.orderedIds.map((id) => asProductMediaId(id)), input.actor))
}
