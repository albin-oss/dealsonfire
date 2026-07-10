/**
 * Variant — child ENTITY of the Product aggregate (ADR-002 §6: durable identity because
 * listings, inventory, and future order lines all point at variant_id; NOT an aggregate
 * because its load-bearing invariants — option-space integrity, combination uniqueness —
 * span the variant SET and need single-transaction enforcement at the Product root).
 * Hot fields (stock, scheduled prices) are deliberately absent: they live in the
 * inventory/pricing subdomains (ADR-002 D2-5/D2-6).
 */
import { type Result, ok, err } from '../../../../shared/result'
import { type DomainError, domainError } from '../../../../shared/errors'
import { createPrice, type Price as Money } from '../../../merchant/shared-kernel/price'
import { type VariantId, newVariantId } from '../../shared-kernel/ids'

export const MAX_SKU_LENGTH = 64
const SKU_RE = /^[A-Z0-9](?:[A-Z0-9._-]{0,62}[A-Z0-9])?$/

export type Sku = string & { readonly __sku: true }

export function createSku(raw: string): Result<Sku, DomainError> {
  const sku = raw.trim().toUpperCase()
  if (!SKU_RE.test(sku)) {
    return err(domainError('VALIDATION_FAILED', `SKU must be 1–${MAX_SKU_LENGTH} chars of A–Z 0–9 . _ - (alphanumeric ends): "${raw}"`))
  }
  return ok(sku as Sku)
}

/** Sale window on the variant (BLUEPRINT-002 §2.2). Scheduled transitions live in pricing/. */
export interface SaleWindow {
  readonly amount: number // minor units, same currency as base price
  readonly startsAt: Date
  readonly endsAt: Date
}

export interface VariantProps {
  id: VariantId
  sku: Sku
  optionValues: Readonly<Record<string, string>>
  price: Money
  sale: SaleWindow | null
  /** Per-kind data: physical {weight_grams…} | digital {file media ref…} | service {duration…} */
  kindData: Readonly<Record<string, unknown>> | null
  position: number
}

export interface VariantInput {
  id?: VariantId
  sku?: string
  optionValues?: Record<string, string>
  price: { amount: number; currency: string }
  sale?: { amount: number; startsAt: Date; endsAt: Date } | null
  kindData?: Record<string, unknown> | null
  position?: number
}

function validateSale(sale: NonNullable<VariantInput['sale']>, price: Money): Result<SaleWindow, DomainError> {
  if (!Number.isSafeInteger(sale.amount) || sale.amount < 0) {
    return err(domainError('VALIDATION_FAILED', 'sale amount must be a non-negative integer of minor units'))
  }
  if (sale.amount >= price.amount) {
    return err(domainError('VALIDATION_FAILED', 'sale amount must be lower than the base price'))
  }
  if (!(sale.startsAt instanceof Date) || !(sale.endsAt instanceof Date) || sale.startsAt.getTime() >= sale.endsAt.getTime()) {
    return err(domainError('VALIDATION_FAILED', 'sale window must satisfy startsAt < endsAt'))
  }
  return ok(Object.freeze({ amount: sale.amount, startsAt: sale.startsAt, endsAt: sale.endsAt }))
}

/** Canonical key of an option combination — the duplicate-variant detector. */
export function canonicalOptionKey(optionValues: Readonly<Record<string, string>>): string {
  return JSON.stringify(Object.entries(optionValues).sort(([a], [b]) => a.localeCompare(b)))
}

/**
 * Silent SKU generation — Grandma has no SKUs (ADR-002 §2); the system supplies one.
 * Derived from the RANDOM TAIL of the uuid, never the head: UUIDv7's first hex chars are
 * the millisecond timestamp, so same-ms variants would collide (the D-15 lesson again).
 */
export function generateSku(seed: string): Sku {
  return `DOF-${seed.replace(/-/g, '').slice(-10).toUpperCase()}` as Sku
}

export class Variant {
  private constructor(private readonly props: VariantProps) {}

  static create(input: VariantInput): Result<Variant, DomainError> {
    const price = createPrice(input.price.amount, input.price.currency)
    if (!price.ok) return price
    const id = input.id ?? newVariantId()
    const sku = input.sku !== undefined ? createSku(input.sku) : ok(generateSku(id))
    if (!sku.ok) return sku
    let sale: SaleWindow | null = null
    if (input.sale) {
      const validated = validateSale(input.sale, price.value)
      if (!validated.ok) return validated
      sale = validated.value
    }
    return ok(new Variant({
      id,
      sku: sku.value,
      optionValues: Object.freeze({ ...(input.optionValues ?? {}) }),
      price: price.value,
      sale,
      kindData: input.kindData ? Object.freeze({ ...input.kindData }) : null,
      position: input.position ?? 0,
    }))
  }

  static rehydrate(props: VariantProps): Variant {
    return new Variant(props)
  }

  get id() { return this.props.id }
  get sku() { return this.props.sku }
  get optionValues() { return this.props.optionValues }
  get price() { return this.props.price }
  get sale() { return this.props.sale }
  get kindData() { return this.props.kindData }
  get position() { return this.props.position }

  get combinationKey(): string {
    return canonicalOptionKey(this.props.optionValues)
  }

  /** Active sale at `now` — time is a parameter, never sampled inside the entity. */
  effectiveAmount(now: Date): number {
    const sale = this.props.sale
    if (sale && now >= sale.startsAt && now < sale.endsAt) return sale.amount
    return this.props.price.amount
  }

  /**
   * Applies changes and reports ONLY what actually changed (REVIEW-003 H-1, D-29):
   * events describe detected deltas, never the request shape. A same-value "change"
   * contributes nothing to fieldsChanged; an all-no-op update returns an empty list and
   * the aggregate emits nothing.
   */
  update(changes: {
    sku?: string
    price?: { amount: number; currency: string }
    sale?: { amount: number; startsAt: Date; endsAt: Date } | null
    optionValues?: Record<string, string>
    kindData?: Record<string, unknown> | null
  }): Result<{ fieldsChanged: string[]; priceChanged: boolean; previousPrice: Money }, DomainError> {
    const previousPrice = this.props.price
    const previousSale = this.props.sale

    let nextPrice = this.props.price
    if (changes.price) {
      const price = createPrice(changes.price.amount, changes.price.currency)
      if (!price.ok) return price
      nextPrice = price.value
    }
    let nextSale = this.props.sale
    if (changes.sale !== undefined) {
      if (changes.sale === null) {
        nextSale = null
      } else {
        const validated = validateSale(changes.sale, nextPrice)
        if (!validated.ok) return validated
        nextSale = validated.value
      }
    } else if (changes.price && nextSale && nextSale.amount >= nextPrice.amount) {
      // Base price dropped below an existing sale: the sale no longer makes sense.
      return err(domainError('VALIDATION_FAILED', 'new base price is not above the existing sale amount; update or clear the sale'))
    }
    let nextSku = this.props.sku
    if (changes.sku !== undefined) {
      const sku = createSku(changes.sku)
      if (!sku.ok) return sku
      nextSku = sku.value
    }

    // ——— change DETECTION (not request echoing)
    const fieldsChanged: string[] = []
    if (nextSku !== this.props.sku) fieldsChanged.push('sku')
    const basePriceChanged = nextPrice.amount !== previousPrice.amount || nextPrice.currency !== previousPrice.currency
    if (basePriceChanged) fieldsChanged.push('price')
    const saleChanged = JSON.stringify(nextSale) !== JSON.stringify(previousSale)
    if (saleChanged) fieldsChanged.push('sale')
    const optionValuesChanged =
      changes.optionValues !== undefined &&
      canonicalOptionKey(changes.optionValues) !== canonicalOptionKey(this.props.optionValues)
    if (optionValuesChanged) fieldsChanged.push('option_values')
    const kindDataChanged =
      changes.kindData !== undefined &&
      JSON.stringify(changes.kindData ?? null) !== JSON.stringify(this.props.kindData ?? null)
    if (kindDataChanged) fieldsChanged.push('kind_data')

    if (fieldsChanged.length === 0) {
      return ok({ fieldsChanged, priceChanged: false, previousPrice })
    }

    this.props.price = nextPrice
    this.props.sale = nextSale
    this.props.sku = nextSku
    if (optionValuesChanged) this.props.optionValues = Object.freeze({ ...changes.optionValues! })
    if (kindDataChanged) this.props.kindData = changes.kindData ? Object.freeze({ ...changes.kindData }) : null

    return ok({ fieldsChanged, priceChanged: basePriceChanged || saleChanged, previousPrice })
  }

  setPosition(position: number): void {
    this.props.position = position
  }

  /** Aggregate-internal: option-axis changes rewrite combinations after validation. */
  replaceOptionValues(optionValues: Record<string, string>): void {
    this.props.optionValues = Object.freeze({ ...optionValues })
  }
}
