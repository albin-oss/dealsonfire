/**
 * CreateProduct command (IMP-COM-001B) — triple gate → tier limit → factory → insert →
 * events (traced) → audit, one transaction. Kernel command shape throughout.
 */
import { type Result, ok, err } from '../../../../../shared/result'
import { domainError, type DomainError } from '../../../../../shared/errors'
import { traceFromRequest } from '../../../../../platform/trace'
import type { Actor } from '../../../../merchant/shared-kernel/actor'
import { asBusinessId } from '../../../../merchant/shared-kernel/ids'
import { createProduct as productFactory, type CreateProductInput as FactoryInput } from '../../domain/factories/product-factory'
import { withAuthorizedBusiness } from '../access'
import { productToDTO, type ProductDTO } from '../dto'
import { type CommerceDeps, PRODUCT_TIER_LIMITS } from '../ports'

export interface CreateProductCommand {
  actor: Actor
  userId: string
  businessId: string
  title: string
  description?: { format?: 'plain' | 'markdown'; content: string } | null
  fulfillmentKind: FactoryInput['fulfillmentKind']
  categoryRef?: string | null
  options?: Array<{ name: string; values: string[] }>
  variants?: FactoryInput['variants']
  defaultPrice?: { amount: number; currency: string }
  media?: FactoryInput['media']
  requestContext?: Record<string, unknown>
}

export function createProductCommand(deps: CommerceDeps) {
  return async (input: CreateProductCommand): Promise<Result<ProductDTO, DomainError>> => {
    return deps.uow.withTransaction(async (tx) => {
      const access = await withAuthorizedBusiness(deps, tx, {
        userId: input.userId,
        actor: input.actor,
        businessId: input.businessId,
        spec: { command: 'commerce.product.create', permission: 'catalog.product.write', capability: 'catalog.products' },
      })
      if (!access.ok) return access

      const limit = PRODUCT_TIER_LIMITS[access.value.business.scaleTier] ?? PRODUCT_TIER_LIMITS.starter!
      const existing = await deps.products.countActiveByBusiness(tx, asBusinessId(input.businessId))
      if (existing >= limit) {
        return err(domainError('TIER_LIMIT_REACHED', `the ${access.value.business.scaleTier} tier allows ${limit} active products`, { limit }))
      }

      const made = productFactory({
        businessId: asBusinessId(input.businessId),
        title: input.title,
        description: input.description ?? null,
        fulfillmentKind: input.fulfillmentKind,
        categoryRef: input.categoryRef ?? null,
        options: input.options,
        variants: input.variants,
        defaultPrice: input.defaultPrice,
        media: input.media,
        actor: input.actor,
        source: 'manual',
      })
      if (!made.ok) return made

      await deps.products.insert(tx, made.value.product)
      await deps.eventStore.append(tx, made.value.events, traceFromRequest(input.requestContext))
      await deps.audit.record(tx, {
        businessId: input.businessId,
        actor: input.actor,
        command: 'commerce.product.create',
        sensitivity: 'normal',
        target: { type: 'product', id: made.value.product.id },
        afterDigest: { title: input.title, variant_count: made.value.product.variants.length },
        context: input.requestContext,
      })
      return ok(productToDTO(made.value.product))
    })
  }
}
