/**
 * AddVariant / UpdateVariant (IMP-COM-001B). Business-wide SKU uniqueness is the DB's
 * line (uq_variants_business_sku) — a 23505 there surfaces as SKU_TAKEN via the endpoint
 * wrapper's conflict mapping; intra-aggregate uniqueness is the aggregate's (I4).
 */
import { type Result, ok, err } from '../../../../../shared/result'
import { domainError, type DomainError } from '../../../../../shared/errors'
import { traceFromRequest } from '../../../../../platform/trace'
import type { Actor } from '../../../../merchant/shared-kernel/actor'
import { asVariantId } from '../../../shared-kernel/ids'
import type { VariantInput } from '../../domain/variant'
import { withAuthorizedProduct } from '../access'
import { productToDTO, type ProductDTO } from '../dto'
import type { CommerceDeps } from '../ports'

export interface AddVariantCommand {
  actor: Actor
  userId: string
  productId: string
  variant: VariantInput
  requestContext?: Record<string, unknown>
}

export function addVariantCommand(deps: CommerceDeps) {
  return async (input: AddVariantCommand): Promise<Result<ProductDTO, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const authorized = await withAuthorizedProduct(deps, tx, {
        userId: input.userId, actor: input.actor, productId: input.productId,
        spec: { command: 'commerce.variant.add', permission: 'catalog.product.write', capability: 'catalog.products' },
      })
      if (!authorized.ok) return authorized
      const { product } = authorized.value

      // ACCEPTANCE-001 B2 guidance: the domain answers "duplicate combination", which is
      // correct and baffling — a merchant with a simple product never made "options".
      // Errors should educate, not merely reject.
      if (product.options.length === 0 && product.variants.length >= 1) {
        return err(domainError('CONFLICT',
          'This product currently has no options. Add an option (for example Size or Color) ' +
          'via POST /products/{id}/options before creating additional variants.',
          { hint: 'add_option_first', options_endpoint: `/api/v1/products/${product.id}/options` }))
      }

      const added = product.addVariant(input.variant, input.actor)
      if (!added.ok) return added

      await deps.products.update(tx, product)
      await deps.eventStore.append(tx, product.pullPendingEvents(), traceFromRequest(input.requestContext))
      await deps.audit.record(tx, {
        businessId: product.businessId, actor: input.actor, command: 'commerce.variant.add',
        sensitivity: 'normal', target: { type: 'product', id: product.id },
        afterDigest: { variant_id: added.value, variant_count: product.variants.length },
        context: input.requestContext,
      })
      return ok(productToDTO(product))
    })
  }
}

export interface UpdateVariantCommand {
  actor: Actor
  userId: string
  productId: string
  variantId: string
  changes: {
    sku?: string
    price?: { amount: number; currency: string }
    sale?: { amount: number; startsAt: Date; endsAt: Date } | null
    optionValues?: Record<string, string>
    kindData?: Record<string, unknown> | null
  }
  requestContext?: Record<string, unknown>
}

export function updateVariantCommand(deps: CommerceDeps) {
  return async (input: UpdateVariantCommand): Promise<Result<ProductDTO, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const authorized = await withAuthorizedProduct(deps, tx, {
        userId: input.userId, actor: input.actor, productId: input.productId,
        spec: { command: 'commerce.variant.update', permission: 'catalog.product.write', capability: 'catalog.products' },
      })
      if (!authorized.ok) return authorized
      const { product } = authorized.value

      const updated = product.updateVariant(asVariantId(input.variantId), input.changes, input.actor)
      if (!updated.ok) return updated

      const events = product.pullPendingEvents()
      if (events.length > 0) { // D-29: detected no-ops persist and audit nothing
        await deps.products.update(tx, product)
        await deps.eventStore.append(tx, events, traceFromRequest(input.requestContext))
        await deps.audit.record(tx, {
          businessId: product.businessId, actor: input.actor, command: 'commerce.variant.update',
          sensitivity: 'normal', target: { type: 'product', id: product.id },
          afterDigest: { variant_id: input.variantId, events: events.map((e) => e.eventType) },
          context: input.requestContext,
        })
      }
      return ok(productToDTO(product))
    })
  }
}
