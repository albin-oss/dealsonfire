/**
 * Product — aggregate root (ADR-002 §4.1, IMP-COM-001). The unit a merchant thinks in.
 * Owns Variants and ProductMedia because their load-bearing invariants span the SET and
 * need single-transaction enforcement here (option-space integrity, combination and media
 * uniqueness). Construction goes through ProductFactory; this class enforces every
 * mutation-time invariant and emits the event catalog.
 *
 * INVARIANTS (each explained at its enforcement site):
 *  I1  ≥1 variant at all times (the unit of sale must exist — ADR-002 §2).
 *  I2  Option integrity: every variant's option keys EXACTLY equal the declared option
 *      names, and every value is a declared value of its option.
 *  I3  No duplicate variant combinations (two variants meaning the same purchasable thing
 *      is a data corruption, not a choice).
 *  I4  SKU uniqueness within the aggregate (business-wide uniqueness is the DB's line,
 *      persistence sprint).
 *  I5  Option axes may only change in ways that keep every variant valid and distinct
 *      (add axis = every existing variant receives a declared value; remove axis/value =
 *      only when variants stay valid and distinct afterwards).
 *  I6  Media uniqueness per (asset, scope): the same asset may appear once product-wide
 *      and once per variant; at most ONE hero per scope (the hero IS the scope's face).
 *  I7  Media may only reference variants that exist.
 *  I8  Status transitions follow the machine (draft → active ⇄ archived); archive is
 *      idempotent; restore from non-archived is an error.
 *  I9  Archived products are read-only except restore ("illegal archive operations").
 *  I10 Category references are format-valid opaque strings (K3 — no invented semantics).
 *  I11 Bounded collections: ≤3 options, ≤100 variants, ≤50 media (documented extension
 *      points, not physics — raising them is a decision, not a bug).
 *
 * CONCURRENCY: exactly the Merchant Kernel pattern — the aggregate carries no version
 * field; commands load with a row lock (repository `forUpdate`) and the per-aggregate
 * `sequence` UNIQUE guard at event append surfaces lost races as conflicts (D-15 family).
 */
import { type Result, ok, err } from '../../../../shared/result'
import { type DomainError, domainError } from '../../../../shared/errors'
import type { Actor } from '../../../merchant/shared-kernel/actor'
import type { BusinessId } from '../../../merchant/shared-kernel/ids'
import type { AIProvenance } from '../../../merchant/shared-kernel/ai-provenance'
import { clearFieldProvenance } from '../../../merchant/shared-kernel/ai-provenance'
import { type Option, createOption, MAX_OPTIONS_PER_PRODUCT } from '../../shared-kernel/option'
import { type ProductId, type VariantId, type ProductMediaId } from '../../shared-kernel/ids'
import {
  type ProductTitle, type ProductDescription, type CategoryReference, type ProductStatus,
  type FulfillmentKind, createProductTitle, createProductDescription, createCategoryReference,
} from './value-objects'
import { Variant, type VariantInput } from './variant'
import { ProductMedia, type ProductMediaInput } from './product-media'
import { COMMERCE_EVENT, makeCommerceEvent, type NewDomainEvent } from './events'
import { validateProduct } from './product-validator'

export const MAX_VARIANTS_PER_PRODUCT = 100
export const MAX_MEDIA_PER_PRODUCT = 50

export interface ProductProps {
  id: ProductId
  businessId: BusinessId
  title: ProductTitle
  description: ProductDescription | null
  fulfillmentKind: FulfillmentKind
  categoryRef: CategoryReference | null
  attributes: Readonly<Record<string, unknown>>
  options: readonly Option[]
  variants: Variant[]
  media: ProductMedia[]
  status: ProductStatus
  aiProvenance: AIProvenance
}

export class Product {
  private pending: NewDomainEvent[] = []

  private constructor(private readonly props: ProductProps) {}

  /** Construction happens through ProductFactory (encodes what a valid newborn product is). */
  static fromFactory(props: ProductProps): Product {
    return new Product(props)
  }
  static rehydrate(props: ProductProps): Product {
    return new Product(props)
  }

  get id() { return this.props.id }
  get businessId() { return this.props.businessId }
  get title() { return this.props.title }
  get description() { return this.props.description }
  get fulfillmentKind() { return this.props.fulfillmentKind }
  get categoryRef() { return this.props.categoryRef }
  get attributes() { return this.props.attributes }
  get options(): readonly Option[] { return this.props.options }
  get variants(): readonly Variant[] { return this.props.variants }
  get media(): readonly ProductMedia[] { return [...this.props.media].sort((a, b) => a.position - b.position) }
  get status() { return this.props.status }
  get aiProvenance() { return this.props.aiProvenance }

  // ————————————————————————————————————————————————— guards

  /** I9: archived products are read-only except restore. */
  private ensureMutable(): Result<void, DomainError> {
    if (this.props.status === 'archived') {
      return err(domainError('INVALID_TRANSITION', 'archived products are read-only; restore first'))
    }
    return ok(undefined)
  }

  /** I2: a combination is valid iff its keys are exactly the option names and values are declared. */
  private validateCombination(optionValues: Readonly<Record<string, string>>): Result<void, DomainError> {
    const optionNames = this.props.options.map((o) => o.name)
    const keys = Object.keys(optionValues)
    if (keys.length !== optionNames.length || !optionNames.every((n) => n in optionValues)) {
      return err(domainError('VALIDATION_FAILED',
        `variant option values must cover exactly: [${optionNames.join(', ')}]`, { expected: optionNames, got: keys }))
    }
    for (const option of this.props.options) {
      const value = optionValues[option.name]
      if (!option.values.some((v) => v === value)) {
        return err(domainError('VALIDATION_FAILED',
          `"${value}" is not a declared value of option "${option.name}"`, { option: option.name, declared: [...option.values] }))
      }
    }
    return ok(undefined)
  }

  /** I3 across the set, optionally treating one variant as replaced. */
  private assertUniqueCombination(key: string, ignoreVariantId?: VariantId): Result<void, DomainError> {
    const clash = this.props.variants.find((v) => v.id !== ignoreVariantId && v.combinationKey === key)
    if (clash) {
      return err(domainError('CONFLICT', 'a variant with this option combination already exists', { variant_id: clash.id }))
    }
    return ok(undefined)
  }

  /** I4 within the aggregate (case-insensitive by SKU normalization). */
  private assertUniqueSku(sku: string, ignoreVariantId?: VariantId): Result<void, DomainError> {
    const clash = this.props.variants.find((v) => v.id !== ignoreVariantId && v.sku === sku)
    if (clash) {
      return err(domainError('CONFLICT', `SKU "${sku}" is already used by another variant of this product`, { variant_id: clash.id }))
    }
    return ok(undefined)
  }

  private emitUpdated(actor: Actor, fieldsChanged: string[]): void {
    this.pending.push(makeCommerceEvent(COMMERCE_EVENT.PRODUCT_UPDATED, this.props.id, this.props.businessId, actor, {
      product_id: this.props.id, business_id: this.props.businessId, fields_changed: fieldsChanged, status: this.props.status,
    }))
  }

  // ————————————————————————————————————————————————— identity & content

  rename(rawTitle: string, actor: Actor): Result<void, DomainError> {
    const mutable = this.ensureMutable()
    if (!mutable.ok) return mutable
    const title = createProductTitle(rawTitle)
    if (!title.ok) return title
    if (title.value === this.props.title) return ok(undefined) // no-op, no event (kernel idiom)
    this.props.title = title.value
    this.props.aiProvenance = clearFieldProvenance(this.props.aiProvenance, 'title') // D-29 supersession
    this.emitUpdated(actor, ['title'])
    return ok(undefined)
  }

  updateDescription(input: { format?: 'plain' | 'markdown'; content: string } | null, actor: Actor): Result<void, DomainError> {
    const mutable = this.ensureMutable()
    if (!mutable.ok) return mutable
    if (input === null) {
      if (this.props.description === null) return ok(undefined)
      this.props.description = null
    } else {
      const description = createProductDescription(input)
      if (!description.ok) return description
      this.props.description = description.value
    }
    this.props.aiProvenance = clearFieldProvenance(this.props.aiProvenance, 'description') // D-29
    this.emitUpdated(actor, ['description'])
    return ok(undefined)
  }

  /** I10: format-valid opaque reference or null; semantics belong to Taxonomy (K3). */
  setCategory(raw: string | null, actor: Actor): Result<void, DomainError> {
    const mutable = this.ensureMutable()
    if (!mutable.ok) return mutable
    if (raw === null) {
      if (this.props.categoryRef === null) return ok(undefined)
      this.props.categoryRef = null
    } else {
      const ref = createCategoryReference(raw)
      if (!ref.ok) return ref
      if (ref.value === this.props.categoryRef) return ok(undefined)
      this.props.categoryRef = ref.value
    }
    this.props.aiProvenance = clearFieldProvenance(this.props.aiProvenance, 'category') // D-29
    this.emitUpdated(actor, ['category'])
    return ok(undefined)
  }

  // ————————————————————————————————————————————————— options (I5)

  /**
   * Adding an option axis re-shapes the variant space: every EXISTING variant must be
   * assigned a declared value for the new axis (the caller decides which — the domain
   * cannot guess whether the existing soap was Lavender or Rose).
   */
  addOption(
    input: { name: string; values: string[] },
    valuesForExistingVariants: ReadonlyMap<VariantId, string>,
    actor: Actor,
  ): Result<void, DomainError> {
    const mutable = this.ensureMutable()
    if (!mutable.ok) return mutable
    if (this.props.options.length >= MAX_OPTIONS_PER_PRODUCT) {
      return err(domainError('VALIDATION_FAILED', `a product may declare at most ${MAX_OPTIONS_PER_PRODUCT} options (I11 — extension point, not physics)`))
    }
    const option = createOption(input.name, input.values)
    if (!option.ok) return option
    if (this.props.options.some((o) => o.name.toLowerCase() === option.value.name.toLowerCase())) {
      return err(domainError('CONFLICT', `option "${option.value.name}" already exists`))
    }
    // Every existing variant must land on a declared value of the new axis (I2 preserved).
    const rewritten = new Map<VariantId, Record<string, string>>()
    for (const variant of this.props.variants) {
      const assigned = valuesForExistingVariants.get(variant.id)
      if (assigned === undefined) {
        return err(domainError('VALIDATION_FAILED', `variant ${variant.id} was not assigned a value for new option "${option.value.name}"`))
      }
      if (!option.value.values.some((v) => v === assigned)) {
        return err(domainError('VALIDATION_FAILED', `"${assigned}" is not a declared value of new option "${option.value.name}"`))
      }
      rewritten.set(variant.id, { ...variant.optionValues, [option.value.name]: assigned })
    }
    this.props.options = Object.freeze([...this.props.options, option.value])
    for (const variant of this.props.variants) {
      variant.replaceOptionValues(rewritten.get(variant.id)!)
    }
    // Adding an axis cannot merge previously-distinct combinations (superset keys) — I3 holds.
    this.emitUpdated(actor, ['options'])
    return ok(undefined)
  }

  addOptionValue(optionName: string, rawValue: string, actor: Actor): Result<void, DomainError> {
    const mutable = this.ensureMutable()
    if (!mutable.ok) return mutable
    const index = this.props.options.findIndex((o) => o.name === optionName)
    if (index === -1) return err(domainError('NOT_FOUND', `option "${optionName}" does not exist`))
    const existing = this.props.options[index]!
    const extended = createOption(existing.name, [...existing.values, rawValue])
    if (!extended.ok) return extended // includes duplicate-value detection
    const options = [...this.props.options]
    options[index] = extended.value
    this.props.options = Object.freeze(options)
    this.emitUpdated(actor, ['options'])
    return ok(undefined)
  }

  /** A value may be retired only when no variant occupies that point of the space (I5). */
  removeOptionValue(optionName: string, value: string, actor: Actor): Result<void, DomainError> {
    const mutable = this.ensureMutable()
    if (!mutable.ok) return mutable
    const index = this.props.options.findIndex((o) => o.name === optionName)
    if (index === -1) return err(domainError('NOT_FOUND', `option "${optionName}" does not exist`))
    const existing = this.props.options[index]!
    if (!existing.values.some((v) => v === value)) {
      return err(domainError('NOT_FOUND', `option "${optionName}" has no value "${value}"`))
    }
    if (this.props.variants.some((v) => v.optionValues[optionName] === value)) {
      return err(domainError('CONFLICT', `option value "${value}" is used by existing variants`))
    }
    const remaining = existing.values.filter((v) => v !== value)
    if (remaining.length === 0) {
      return err(domainError('VALIDATION_FAILED', `option "${optionName}" must keep at least one value; remove the option instead`))
    }
    const rebuilt = createOption(existing.name, remaining as string[])
    if (!rebuilt.ok) return rebuilt
    const options = [...this.props.options]
    options[index] = rebuilt.value
    this.props.options = Object.freeze(options)
    this.emitUpdated(actor, ['options'])
    return ok(undefined)
  }

  /**
   * Removing an axis collapses combinations — allowed only if every variant remains
   * DISTINCT on the remaining axes (I3/I5). Otherwise the merchant must delete variants
   * first (explicitly — the domain never guesses which twin to keep).
   */
  removeOption(optionName: string, actor: Actor): Result<void, DomainError> {
    const mutable = this.ensureMutable()
    if (!mutable.ok) return mutable
    if (!this.props.options.some((o) => o.name === optionName)) {
      return err(domainError('NOT_FOUND', `option "${optionName}" does not exist`))
    }
    const collapsed = new Map<string, VariantId>()
    for (const variant of this.props.variants) {
      const { [optionName]: _removed, ...rest } = variant.optionValues
      const key = JSON.stringify(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)))
      const clash = collapsed.get(key)
      if (clash) {
        return err(domainError('CONFLICT',
          `removing option "${optionName}" would make variants ${clash} and ${variant.id} identical`,
          { variant_ids: [clash, variant.id] }))
      }
      collapsed.set(key, variant.id)
    }
    this.props.options = Object.freeze(this.props.options.filter((o) => o.name !== optionName))
    for (const variant of this.props.variants) {
      const { [optionName]: _removed, ...rest } = variant.optionValues
      variant.replaceOptionValues(rest)
    }
    this.emitUpdated(actor, ['options'])
    return ok(undefined)
  }

  // ————————————————————————————————————————————————— variants

  addVariant(input: VariantInput, actor: Actor): Result<VariantId, DomainError> {
    const mutable = this.ensureMutable()
    if (!mutable.ok) return mutable
    if (this.props.variants.length >= MAX_VARIANTS_PER_PRODUCT) {
      return err(domainError('VALIDATION_FAILED', `a product may have at most ${MAX_VARIANTS_PER_PRODUCT} variants (I11)`))
    }
    const variant = Variant.create({ ...input, position: this.props.variants.length })
    if (!variant.ok) return variant

    const combination = this.validateCombination(variant.value.optionValues) // I2
    if (!combination.ok) return combination
    const unique = this.assertUniqueCombination(variant.value.combinationKey) // I3
    if (!unique.ok) return unique
    const sku = this.assertUniqueSku(variant.value.sku) // I4
    if (!sku.ok) return sku

    this.props.variants.push(variant.value)
    this.pending.push(makeCommerceEvent(COMMERCE_EVENT.VARIANT_ADDED, this.props.id, this.props.businessId, actor, {
      product_id: this.props.id, business_id: this.props.businessId,
      variant_id: variant.value.id, sku: variant.value.sku as string,
      option_values: { ...variant.value.optionValues },
    }))
    return ok(variant.value.id)
  }

  updateVariant(
    variantId: VariantId,
    changes: Parameters<Variant['update']>[0],
    actor: Actor,
  ): Result<void, DomainError> {
    const mutable = this.ensureMutable()
    if (!mutable.ok) return mutable
    const variant = this.props.variants.find((v) => v.id === variantId)
    if (!variant) return err(domainError('NOT_FOUND', 'variant not found'))

    if (changes.optionValues !== undefined) {
      const combination = this.validateCombination(changes.optionValues) // I2
      if (!combination.ok) return combination
      const key = JSON.stringify(Object.entries(changes.optionValues).sort(([a], [b]) => a.localeCompare(b)))
      const unique = this.assertUniqueCombination(key, variantId) // I3
      if (!unique.ok) return unique
    }
    if (changes.sku !== undefined) {
      const normalized = changes.sku.trim().toUpperCase()
      const sku = this.assertUniqueSku(normalized, variantId) // I4
      if (!sku.ok) return sku
    }

    const updated = variant.update(changes)
    if (!updated.ok) return updated

    // D-29 (REVIEW-003 H-1): events describe DETECTED change, never the request shape.
    // An all-no-op update emits nothing — variant.updated with empty fields_changed would
    // be rejected by its own registered schema and dead-letter at dispatch.
    if (updated.value.fieldsChanged.length === 0) return ok(undefined)

    this.pending.push(makeCommerceEvent(COMMERCE_EVENT.VARIANT_UPDATED, this.props.id, this.props.businessId, actor, {
      product_id: this.props.id, business_id: this.props.businessId, variant_id: variantId,
      fields_changed: updated.value.fieldsChanged,
    }))
    if (updated.value.priceChanged) {
      this.props.aiProvenance = clearFieldProvenance(this.props.aiProvenance, 'price') // D-29 supersession
      // ADR-002 §13: price changes are their own high-fan-out fact (D-28).
      this.pending.push(makeCommerceEvent(COMMERCE_EVENT.VARIANT_PRICE_CHANGED, this.props.id, this.props.businessId, actor, {
        product_id: this.props.id, business_id: this.props.businessId, variant_id: variantId,
        old_price: { amount: updated.value.previousPrice.amount, currency: updated.value.previousPrice.currency },
        new_price: { amount: variant.price.amount, currency: variant.price.currency },
        sale_active: variant.sale !== null,
        source: 'manual' as const,
      }))
    }
    return ok(undefined)
  }

  // ————————————————————————————————————————————————— lifecycle (I8/I9)

  /**
   * draft → active ONLY. Exposed for the publishing sprint (first listing publish
   * activates). archived → active goes through restore() exclusively — same target state,
   * different meaning, and I9 demands the explicit door.
   */
  activate(actor: Actor): Result<void, DomainError> {
    if (this.props.status === 'active') return ok(undefined) // idempotent (kernel idiom)
    if (this.props.status !== 'draft') {
      return err(domainError('INVALID_TRANSITION', `cannot activate a ${this.props.status} product — restore it instead`))
    }
    this.props.status = 'active'
    this.emitUpdated(actor, ['status'])
    return ok(undefined)
  }

  archive(actor: Actor): Result<void, DomainError> {
    if (this.props.status === 'archived') return ok(undefined) // idempotent no-op, no event
    // draft → archived and active → archived are both legal (I8)
    this.props.status = 'archived'
    this.pending.push(makeCommerceEvent(COMMERCE_EVENT.PRODUCT_ARCHIVED, this.props.id, this.props.businessId, actor, {
      product_id: this.props.id, business_id: this.props.businessId,
    }))
    return ok(undefined)
  }

  /** archived → active. Restoring lands on ACTIVE (ADR-002 §4.6's ⇄; recorded in D-28). */
  restore(actor: Actor): Result<void, DomainError> {
    if (this.props.status !== 'archived') {
      return err(domainError('INVALID_TRANSITION', `cannot restore a ${this.props.status} product — only archived products restore`))
    }
    this.props.status = 'active'
    this.emitUpdated(actor, ['status'])
    return ok(undefined)
  }

  // ————————————————————————————————————————————————— media (I6/I7)

  addMedia(input: ProductMediaInput, actor: Actor): Result<ProductMediaId, DomainError> {
    const mutable = this.ensureMutable()
    if (!mutable.ok) return mutable
    if (this.props.media.length >= MAX_MEDIA_PER_PRODUCT) {
      return err(domainError('VALIDATION_FAILED', `a product may have at most ${MAX_MEDIA_PER_PRODUCT} media items (I11)`))
    }
    const media = ProductMedia.create({ ...input, position: this.props.media.length })
    if (!media.ok) return media
    if (media.value.variantId && !this.props.variants.some((v) => v.id === media.value.variantId)) {
      return err(domainError('NOT_FOUND', 'media references a variant that does not exist on this product')) // I7
    }
    if (this.props.media.some((m) => m.attachmentKey === media.value.attachmentKey)) {
      return err(domainError('CONFLICT', 'this asset is already attached at this scope')) // I6
    }
    if (media.value.role === 'hero') {
      const scopeClash = this.props.media.find((m) => m.role === 'hero' && m.variantId === media.value.variantId)
      if (scopeClash) {
        return err(domainError('CONFLICT', 'this scope already has a hero image; remove or demote it first')) // I6
      }
    }
    this.props.media.push(media.value)
    this.pending.push(makeCommerceEvent(COMMERCE_EVENT.PRODUCT_MEDIA_ADDED, this.props.id, this.props.businessId, actor, {
      product_id: this.props.id, business_id: this.props.businessId,
      product_media_id: media.value.id, media_id: media.value.media.mediaId as string,
      variant_id: media.value.variantId, role: media.value.role,
    }))
    return ok(media.value.id)
  }

  removeMedia(productMediaId: ProductMediaId, actor: Actor): Result<void, DomainError> {
    const mutable = this.ensureMutable()
    if (!mutable.ok) return mutable
    const index = this.props.media.findIndex((m) => m.id === productMediaId)
    if (index === -1) return err(domainError('NOT_FOUND', 'media item not found'))
    const [removed] = this.props.media.splice(index, 1)
    this.props.media.forEach((m, i) => m.setPosition(i)) // renumber — positions stay dense
    this.pending.push(makeCommerceEvent(COMMERCE_EVENT.PRODUCT_MEDIA_REMOVED, this.props.id, this.props.businessId, actor, {
      product_id: this.props.id, business_id: this.props.businessId,
      product_media_id: removed!.id, media_id: removed!.media.mediaId as string,
    }))
    return ok(undefined)
  }

  /** The ordered ids must be a permutation of the current set — no ghosts, no omissions. */
  reorderMedia(orderedIds: readonly ProductMediaId[], actor: Actor): Result<void, DomainError> {
    const mutable = this.ensureMutable()
    if (!mutable.ok) return mutable
    const current = new Set(this.props.media.map((m) => m.id))
    if (orderedIds.length !== current.size || !orderedIds.every((id) => current.has(id)) || new Set(orderedIds).size !== orderedIds.length) {
      return err(domainError('VALIDATION_FAILED', 'reorder must list every media id exactly once'))
    }
    const currentOrder = this.media.map((m) => m.id)
    if (orderedIds.every((id, i) => id === currentOrder[i])) return ok(undefined) // no-op: silent (D-29)
    orderedIds.forEach((id, position) => {
      this.props.media.find((m) => m.id === id)!.setPosition(position)
    })
    this.emitUpdated(actor, ['media_order'])
    return ok(undefined)
  }

  // ————————————————————————————————————————————————— validation & events

  /**
   * Whole-aggregate consistency check (I1–I11) — one rule set shared by the factory,
   * rehydration guards, and tests (product-validator imports only this class's TYPE,
   * so there is no runtime cycle).
   */
  validate(): DomainError[] {
    return validateProduct(this)
  }

  pullPendingEvents(): NewDomainEvent[] {
    const events = this.pending
    this.pending = []
    return events
  }
}
