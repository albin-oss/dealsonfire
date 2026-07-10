/**
 * ProductValidator — domain service (IMP-COM-001): the whole-aggregate consistency rules
 * (I1–I11) as ONE pure function. The aggregate enforces invariants at mutation time;
 * this validator re-derives them over a complete instance — used by ProductFactory
 * (newborn products), rehydration guards (persistence sprint: a corrupt row must fail
 * loudly, ADR-004 rule 23's "survive bugs" line), and tests.
 * Imports the Product TYPE only — no runtime cycle.
 */
import { type DomainError, domainError } from '../../../../shared/errors'
import { MAX_OPTIONS_PER_PRODUCT } from '../../shared-kernel/option'
import type { Product } from './product'
import { MAX_VARIANTS_PER_PRODUCT, MAX_MEDIA_PER_PRODUCT } from './product'

export function validateProduct(product: Product): DomainError[] {
  const violations: DomainError[] = []

  // I1 — the unit of sale must exist
  if (product.variants.length === 0) {
    violations.push(domainError('VALIDATION_FAILED', 'I1: product must have at least one variant'))
  }

  // I11 — bounded collections
  if (product.options.length > MAX_OPTIONS_PER_PRODUCT) {
    violations.push(domainError('VALIDATION_FAILED', `I11: more than ${MAX_OPTIONS_PER_PRODUCT} options declared`))
  }
  if (product.variants.length > MAX_VARIANTS_PER_PRODUCT) {
    violations.push(domainError('VALIDATION_FAILED', `I11: more than ${MAX_VARIANTS_PER_PRODUCT} variants`))
  }
  if (product.media.length > MAX_MEDIA_PER_PRODUCT) {
    violations.push(domainError('VALIDATION_FAILED', `I11: more than ${MAX_MEDIA_PER_PRODUCT} media items`))
  }

  // I2 — option integrity for every variant
  const optionNames = product.options.map((o) => o.name)
  for (const variant of product.variants) {
    const keys = Object.keys(variant.optionValues)
    if (keys.length !== optionNames.length || !optionNames.every((n) => n in variant.optionValues)) {
      violations.push(domainError('VALIDATION_FAILED', `I2: variant ${variant.id} does not cover the declared option axes`))
      continue
    }
    for (const option of product.options) {
      const value = variant.optionValues[option.name]
      if (!option.values.some((v) => v === value)) {
        violations.push(domainError('VALIDATION_FAILED', `I2: variant ${variant.id} uses undeclared value "${value}" for option "${option.name}"`))
      }
    }
  }

  // I3 — no duplicate combinations
  const combinations = new Map<string, string>()
  for (const variant of product.variants) {
    const clash = combinations.get(variant.combinationKey)
    if (clash) {
      violations.push(domainError('CONFLICT', `I3: variants ${clash} and ${variant.id} share an option combination`))
    }
    combinations.set(variant.combinationKey, variant.id)
  }

  // I4 — SKU uniqueness within the aggregate
  const skus = new Map<string, string>()
  for (const variant of product.variants) {
    const clash = skus.get(variant.sku)
    if (clash) {
      violations.push(domainError('CONFLICT', `I4: variants ${clash} and ${variant.id} share SKU "${variant.sku}"`))
    }
    skus.set(variant.sku, variant.id)
  }

  // I6 — media uniqueness per scope + one hero per scope
  const attachments = new Set<string>()
  const heroes = new Set<string>()
  for (const item of product.media) {
    if (attachments.has(item.attachmentKey)) {
      violations.push(domainError('CONFLICT', `I6: duplicate media attachment ${item.attachmentKey}`))
    }
    attachments.add(item.attachmentKey)
    if (item.role === 'hero') {
      const scope = item.variantId ?? 'product'
      if (heroes.has(scope)) {
        violations.push(domainError('CONFLICT', `I6: multiple hero images for scope ${scope}`))
      }
      heroes.add(scope)
    }
  }

  // I7 — media→variant references resolve
  const variantIds = new Set<string>(product.variants.map((v) => v.id))
  for (const item of product.media) {
    if (item.variantId && !variantIds.has(item.variantId)) {
      violations.push(domainError('VALIDATION_FAILED', `I7: media ${item.id} references missing variant ${item.variantId}`))
    }
  }

  return violations
}
