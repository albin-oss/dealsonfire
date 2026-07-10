/**
 * ProductFactory (ADR-002 §4.4, IMP-COM-001): encodes what a valid newborn product is.
 * Two doors: `createProduct` (manual/API path) and `fromDraft` (the AI path — BLUEPRINT-002
 * §2.11 product_drafts: "Idea" is a draft artifact, not a product state; acceptance is the
 * human approval that stamps provenance, ADR-001 §13.3).
 * Rules encoded here rather than in callers:
 *  - no options declared → a single silent default variant is legal (Grandma's one soap);
 *  - options declared → every variant must be explicit (the domain never guesses combos);
 *  - SKUs are silently generated when absent (merchants don't owe us warehouse codes);
 *  - a newborn product is DRAFT, always (visibility is a listing concern).
 */
import { type Result, ok, err } from '../../../../../shared/result'
import { type DomainError, domainError } from '../../../../../shared/errors'
import type { Actor } from '../../../../merchant/shared-kernel/actor'
import type { BusinessId } from '../../../../merchant/shared-kernel/ids'
import { EMPTY_PROVENANCE, markFieldAIGenerated, type AIProvenance } from '../../../../merchant/shared-kernel/ai-provenance'
import { createOption, type Option } from '../../../shared-kernel/option'
import { newProductId } from '../../../shared-kernel/ids'
import {
  createProductTitle, createProductDescription, createCategoryReference,
  type FulfillmentKind, FULFILLMENT_KINDS,
} from '../value-objects'
import { Variant, type VariantInput } from '../variant'
import { ProductMedia, type ProductMediaInput } from '../product-media'
import { Product } from '../product'
import { validateProduct } from '../product-validator'
import { COMMERCE_EVENT, makeCommerceEvent, type NewDomainEvent } from '../events'

export interface CreateProductInput {
  businessId: BusinessId
  title: string
  description?: { format?: 'plain' | 'markdown'; content: string } | null
  fulfillmentKind: FulfillmentKind
  categoryRef?: string | null
  attributes?: Record<string, unknown>
  options?: Array<{ name: string; values: string[] }>
  variants?: VariantInput[]
  /** Price for the silent default variant when `variants` is omitted (no-options shortcut). */
  defaultPrice?: { amount: number; currency: string }
  media?: ProductMediaInput[]
  aiProvenance?: AIProvenance
  actor: Actor
  source?: 'manual' | 'draft'
}

export interface NewProductResult {
  product: Product
  events: NewDomainEvent[]
}

export function createProduct(input: CreateProductInput): Result<NewProductResult, DomainError> {
  const title = createProductTitle(input.title)
  if (!title.ok) return title

  if (!FULFILLMENT_KINDS.includes(input.fulfillmentKind)) {
    return err(domainError('VALIDATION_FAILED', `fulfillment kind must be one of: ${FULFILLMENT_KINDS.join(', ')}`))
  }

  let description = null
  if (input.description) {
    const validated = createProductDescription(input.description)
    if (!validated.ok) return validated
    description = validated.value
  }

  let categoryRef = null
  if (input.categoryRef) {
    const validated = createCategoryReference(input.categoryRef)
    if (!validated.ok) return validated
    categoryRef = validated.value
  }

  const options: Option[] = []
  const seenOptionNames = new Set<string>()
  for (const raw of input.options ?? []) {
    const option = createOption(raw.name, raw.values)
    if (!option.ok) return option
    const key = option.value.name.toLowerCase()
    if (seenOptionNames.has(key)) {
      return err(domainError('CONFLICT', `duplicate option "${option.value.name}"`))
    }
    seenOptionNames.add(key)
    options.push(option.value)
  }

  // I1 + the options-vs-variants rule
  const variantInputs = input.variants ?? []
  if (options.length > 0 && variantInputs.length === 0) {
    return err(domainError('VALIDATION_FAILED', 'products with declared options must define their variants explicitly'))
  }
  if (variantInputs.length === 0 && !input.defaultPrice) {
    return err(domainError('VALIDATION_FAILED', 'provide variants, or defaultPrice for the silent default variant'))
  }
  const effectiveVariantInputs: VariantInput[] =
    variantInputs.length > 0
      ? variantInputs
      : [{ price: input.defaultPrice! }] // silent default variant (no options declared — I1)

  const variants: Variant[] = []
  for (const [index, variantInput] of effectiveVariantInputs.entries()) {
    const variant = Variant.create({ ...variantInput, position: index })
    if (!variant.ok) return variant
    variants.push(variant.value)
  }

  const media: ProductMedia[] = []
  for (const [index, mediaInput] of (input.media ?? []).entries()) {
    const item = ProductMedia.create({ ...mediaInput, position: index })
    if (!item.ok) return item
    media.push(item.value)
  }

  const product = Product.fromFactory({
    id: newProductId(),
    businessId: input.businessId,
    title: title.value,
    description,
    fulfillmentKind: input.fulfillmentKind,
    categoryRef,
    attributes: Object.freeze({ ...(input.attributes ?? {}) }),
    options: Object.freeze(options),
    variants,
    media,
    status: 'draft',
    aiProvenance: input.aiProvenance ?? EMPTY_PROVENANCE,
  })

  // A newborn product must satisfy every invariant — the factory refuses corrupt births.
  const violations = validateProduct(product)
  if (violations.length > 0) {
    return err(domainError('VALIDATION_FAILED', 'product is not internally consistent', {
      violations: violations.map((v) => v.message),
    }))
  }

  const events: NewDomainEvent[] = [
    makeCommerceEvent(COMMERCE_EVENT.PRODUCT_CREATED, product.id, input.businessId, input.actor, {
      product_id: product.id, business_id: input.businessId, title: title.value as string,
      fulfillment_kind: input.fulfillmentKind, category_path: (categoryRef as string | null),
      status: product.status, variant_count: variants.length, source: input.source ?? 'manual',
    }),
    ...variants.map((variant) =>
      makeCommerceEvent(COMMERCE_EVENT.VARIANT_ADDED, product.id, input.businessId, input.actor, {
        product_id: product.id, business_id: input.businessId,
        variant_id: variant.id, sku: variant.sku as string, option_values: { ...variant.optionValues },
      })),
    ...media.map((item) =>
      makeCommerceEvent(COMMERCE_EVENT.PRODUCT_MEDIA_ADDED, product.id, input.businessId, input.actor, {
        product_id: product.id, business_id: input.businessId,
        product_media_id: item.id, media_id: item.media.mediaId as string,
        variant_id: item.variantId, role: item.role,
      })),
  ]
  return ok({ product, events })
}

/** The accepted-AI-draft artifact (BLUEPRINT-002 §2.11 product_drafts.draft shape). */
export interface ProductDraftArtifact {
  title: string
  description?: string
  category_path?: string
  fulfillment_kind: FulfillmentKind
  price: { amount: number; currency: string }
  media_ids?: string[]
  provenance: { model: string; promptVersion: string }
}

/**
 * fromDraft — the Ignite/add-by-photo door. Acceptance IS the human approval
 * (ADR-001 §13.3): every AI-authored field is provenance-stamped with humanApproved=true.
 */
export function fromDraft(
  draft: ProductDraftArtifact,
  businessId: BusinessId,
  actor: Actor,
): Result<NewProductResult, DomainError> {
  let provenance = markFieldAIGenerated(EMPTY_PROVENANCE, 'title', {
    model: draft.provenance.model, promptVersion: draft.provenance.promptVersion, humanApproved: true,
  })
  if (draft.description) {
    provenance = markFieldAIGenerated(provenance, 'description', {
      model: draft.provenance.model, promptVersion: draft.provenance.promptVersion, humanApproved: true,
    })
  }
  if (draft.category_path) {
    provenance = markFieldAIGenerated(provenance, 'category', {
      model: draft.provenance.model, promptVersion: draft.provenance.promptVersion, humanApproved: true,
    })
  }
  provenance = markFieldAIGenerated(provenance, 'price', {
    model: draft.provenance.model, promptVersion: draft.provenance.promptVersion, humanApproved: true,
  })

  return createProduct({
    businessId,
    title: draft.title,
    description: draft.description ? { content: draft.description } : null,
    fulfillmentKind: draft.fulfillment_kind,
    categoryRef: draft.category_path ?? null,
    variants: [{ price: draft.price }],
    media: (draft.media_ids ?? []).map((mediaId) => ({ mediaId })),
    aiProvenance: provenance,
    actor,
    source: 'draft',
  })
}
