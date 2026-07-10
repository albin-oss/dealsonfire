/**
 * Option management commands (IMP-COM-001C, closes ACCEPTANCE-001 B2): thin doors over the
 * EXISTING aggregate behaviors — addOption (with the per-variant assignment protocol),
 * addOptionValue, removeOptionValue, removeOption. Zero domain logic here.
 * Options are identified by NAME (the aggregate's identity for them — no new concepts).
 */
import { type Result, ok, err } from '../../../../../shared/result'
import { domainError, type DomainError } from '../../../../../shared/errors'
import { traceFromRequest } from '../../../../../platform/trace'
import type { Actor } from '../../../../merchant/shared-kernel/actor'
import type { VariantId } from '../../../shared-kernel/ids'
import type { Product } from '../../domain/product'
import { withAuthorizedProduct } from '../access'
import { productToDTO, type ProductDTO } from '../dto'
import type { CommerceDeps } from '../ports'

interface OptionCommandBase {
  actor: Actor
  userId: string
  productId: string
  requestContext?: Record<string, unknown>
}

async function execute(
  deps: CommerceDeps,
  input: OptionCommandBase,
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
    if (events.length > 0) {
      await deps.products.update(tx, product)
      await deps.eventStore.append(tx, events, traceFromRequest(input.requestContext))
      await deps.audit.record(tx, {
        businessId: product.businessId,
        actor: input.actor,
        command,
        sensitivity: 'normal',
        target: { type: 'product', id: product.id },
        afterDigest: { options: product.options.map((o) => o.name) },
        context: input.requestContext,
      })
    }
    return ok(productToDTO(product))
  })
}

export interface AddOptionCommand extends OptionCommandBase {
  name: string
  values: string[]
  /** Convenience: assign this declared value to ALL existing variants (Grandma path). */
  existingVariantsValue?: string
  /** Precise per-variant assignments; overrides the convenience default per entry. */
  variantAssignments?: Record<string, string>
}

export function addOptionCommand(deps: CommerceDeps) {
  return (input: AddOptionCommand): Promise<Result<ProductDTO, DomainError>> =>
    execute(deps, input, 'commerce.product.option_add', (product) => {
      const assignments = new Map<VariantId, string>()
      for (const variant of product.variants) {
        const specific = input.variantAssignments?.[variant.id]
        const value = specific ?? input.existingVariantsValue
        if (value !== undefined) assignments.set(variant.id, value)
        // missing entries fall through to the aggregate's explanatory error (I5)
      }
      if (product.variants.length > 0 && assignments.size === 0) {
        return err(domainError('VALIDATION_FAILED',
          `Existing variants need a value for the new option "${input.name}". ` +
          `Send existing_variants_value to apply one value to all of them (e.g. "${input.values[0] ?? 'First value'}"), ` +
          `or variant_assignments to choose per variant.`,
          { variant_ids: product.variants.map((v) => v.id) }))
      }
      return product.addOption({ name: input.name, values: input.values }, assignments, input.actor)
    })
}

export interface AddOptionValuesCommand extends OptionCommandBase {
  optionName: string
  values: string[]
}

export function addOptionValuesCommand(deps: CommerceDeps) {
  return (input: AddOptionValuesCommand): Promise<Result<ProductDTO, DomainError>> =>
    execute(deps, input, 'commerce.product.option_values_add', (product) => {
      for (const value of input.values) {
        const added = product.addOptionValue(input.optionName, value, input.actor)
        if (!added.ok) return added
      }
      return ok(undefined)
    })
}

export interface RemoveOptionValueCommand extends OptionCommandBase {
  optionName: string
  value: string
}

export function removeOptionValueCommand(deps: CommerceDeps) {
  return (input: RemoveOptionValueCommand): Promise<Result<ProductDTO, DomainError>> =>
    execute(deps, input, 'commerce.product.option_value_remove', (product) =>
      product.removeOptionValue(input.optionName, input.value, input.actor))
}

export interface RemoveOptionCommand extends OptionCommandBase {
  optionName: string
}

export function removeOptionCommand(deps: CommerceDeps) {
  return (input: RemoveOptionCommand): Promise<Result<ProductDTO, DomainError>> =>
    execute(deps, input, 'commerce.product.option_remove', (product) =>
      product.removeOption(input.optionName, input.actor))
}
