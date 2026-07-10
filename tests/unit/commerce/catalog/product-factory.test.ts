/**
 * ProductFactory + specifications + event contracts (IMP-COM-001).
 */
import { describe, it, expect } from 'vitest'
import { unwrap } from '@shared/result'
import { createProduct, fromDraft } from '@domains/commerce/catalog/domain/factories/product-factory'
import { checkProductReadiness } from '@domains/commerce/catalog/domain/specifications/product-readiness-specification'
import { checkSellable } from '@domains/commerce/catalog/domain/specifications/sellable-specification'
import { COMMERCE_EVENT } from '@domains/commerce/catalog/domain/events'
import { COMMERCE_EVENT_PAYLOADS, commercePayloadValidators } from '@contracts/schemas/events/commerce-payloads'
import { newVariantId } from '@domains/commerce/shared-kernel/ids'
import { asBusinessId } from '@domains/merchant/shared-kernel/ids'
import type { Actor } from '@domains/merchant/shared-kernel/actor'
import { uuidv7 } from '@platform/uuid'
// @ts-ignore — plain .mjs module shared with the CI script
import { checkEventRegistryCompatibility } from '../../../../scripts/data-constitution/lint.mjs'
import registryLock from '../../../../contracts/schemas/events/registry.lock.json'

const actor: Actor = { type: 'user', id: uuidv7() }
const businessId = asBusinessId(uuidv7())
const EUR = (amount: number) => ({ amount, currency: 'EUR' })

describe('ProductFactory.createProduct', () => {
  it('minimal input: born DRAFT with a silent default variant and the right event stream', () => {
    const { product, events } = unwrap(createProduct({
      businessId, title: 'Lavender Soap', fulfillmentKind: 'physical', defaultPrice: EUR(1500), actor,
    }))
    expect(product.status).toBe('draft')
    expect(product.variants).toHaveLength(1)
    expect(product.variants[0]!.sku).toMatch(/^DOF-/)
    expect(product.variants[0]!.optionValues).toEqual({})
    expect(events.map((e) => e.eventType)).toEqual([COMMERCE_EVENT.PRODUCT_CREATED, COMMERCE_EVENT.VARIANT_ADDED])
    const created = events[0]!.payload as { variant_count: number; source: string; status: string }
    expect(created).toMatchObject({ variant_count: 1, source: 'manual', status: 'draft' })
  })

  it('emits media_added per initial media and validates payloads against the M-6 registry', () => {
    const { events } = unwrap(createProduct({
      businessId, title: 'Soap', fulfillmentKind: 'physical', defaultPrice: EUR(900),
      media: [{ mediaId: uuidv7() }, { mediaId: uuidv7(), role: 'hero' }], actor,
    }))
    const validators = commercePayloadValidators()
    for (const event of events) {
      const validator = validators[event.eventType]
      expect(validator, `schema registered for ${event.eventType}`).toBeDefined()
      expect(validator!(event.payload)).toEqual({ ok: true }) // every emitted payload passes its own contract
    }
  })

  it.each([
    [{ title: '' }, /1–140/],
    [{ fulfillmentKind: 'quantum' as never }, /fulfillment kind/],
    [{ categoryRef: 'BAD//path' }, /category reference/],
    [{ defaultPrice: undefined }, /variants, or defaultPrice/],
    [{ defaultPrice: { amount: 10.5, currency: 'EUR' } }, /minor units/],
  ])('rejects invalid input %j', (overrides, message) => {
    const result = createProduct({
      businessId, title: 'Soap', fulfillmentKind: 'physical', defaultPrice: EUR(900), actor,
      ...(overrides as object),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(message)
  })

  it('options without explicit variants are refused; duplicate creation combos are refused', () => {
    const noVariants = createProduct({
      businessId, title: 'Socks', fulfillmentKind: 'physical', actor,
      options: [{ name: 'Size', values: ['S', 'M'] }],
    })
    expect(!noVariants.ok && noVariants.error.message).toMatch(/must define their variants explicitly/)

    const dupCombo = createProduct({
      businessId, title: 'Socks', fulfillmentKind: 'physical', actor,
      options: [{ name: 'Size', values: ['S', 'M'] }],
      variants: [
        { price: EUR(1), optionValues: { Size: 'S' } },
        { price: EUR(2), optionValues: { Size: 'S' } },
      ],
    })
    expect(!dupCombo.ok && dupCombo.error.code).toBe('VALIDATION_FAILED')
    if (!dupCombo.ok) expect(JSON.stringify(dupCombo.error.details)).toMatch(/I3/)
  })
})

describe('ProductFactory.fromDraft (the AI door — ADR-001 §13.3)', () => {
  it('acceptance stamps provenance humanApproved on every AI-authored field', () => {
    const { product, events } = unwrap(fromDraft({
      title: 'Hand-knitted Baby Blanket',
      description: 'Soft merino wool, made to order.',
      category_path: 'kids/blankets',
      fulfillment_kind: 'physical',
      price: EUR(3200),
      media_ids: [uuidv7()],
      provenance: { model: 'claude-fable-5', promptVersion: 'ignite-v1' },
    }, businessId, actor))

    for (const field of ['title', 'description', 'category', 'price']) {
      const stamp = product.aiProvenance[field]
      expect(stamp, `provenance for ${field}`).toBeDefined()
      expect(stamp!.humanApproved).toBe(true)
      expect(stamp!.model).toBe('claude-fable-5')
    }
    expect((events[0]!.payload as { source: string }).source).toBe('draft')
    expect(product.categoryRef as string).toBe('kids/blankets')
  })
})

describe('ProductReadinessSpecification (computed, never stored)', () => {
  it('a minimal product is ready, with recommendations listed', () => {
    const { product } = unwrap(createProduct({
      businessId, title: 'Soap', fulfillmentKind: 'physical', defaultPrice: EUR(0), actor,
    }))
    const readiness = checkProductReadiness(product)
    expect(readiness.ready).toBe(true)
    expect(readiness.missing).toHaveLength(0)
    expect(readiness.recommended.join(' ')).toMatch(/photo/)
    expect(readiness.recommended.join(' ')).toMatch(/description/)
    expect(readiness.recommended.join(' ')).toMatch(/non-zero price/)
  })

  it('archived products are not ready, with the blocker named', () => {
    const { product } = unwrap(createProduct({
      businessId, title: 'Soap', fulfillmentKind: 'physical', defaultPrice: EUR(900), actor,
    }))
    product.archive(actor)
    const readiness = checkProductReadiness(product)
    expect(readiness.ready).toBe(false)
    expect(readiness.missing[0]).toMatch(/archived/)
  })
})

describe('SellableSpecification (D-03 nullable-context pattern)', () => {
  const now = new Date('2026-08-15')

  function activeProduct() {
    const { product } = unwrap(createProduct({
      businessId, title: 'Soap', fulfillmentKind: 'physical', defaultPrice: EUR(900), actor,
    }))
    product.activate(actor)
    return product
  }

  it('active product + absent modules (nulls) = sellable', () => {
    const product = activeProduct()
    const result = checkSellable(product, product.variants[0]!.id, {
      listingPublished: null, availableInventory: null, now,
    })
    expect(result).toEqual({ sellable: true, reasons: [] })
  })

  it('clauses activate as modules provide inputs', () => {
    const product = activeProduct()
    const variantId = product.variants[0]!.id
    expect(checkSellable(product, variantId, { listingPublished: false, availableInventory: null, now }).reasons)
      .toContain('listing is not published')
    expect(checkSellable(product, variantId, { listingPublished: true, availableInventory: 0, now }).reasons)
      .toContain('out of stock')
    expect(checkSellable(product, variantId, { listingPublished: true, availableInventory: 3, now }).sellable).toBe(true)
  })

  it('non-active status and unknown variants are never sellable', () => {
    const { product } = unwrap(createProduct({
      businessId, title: 'Soap', fulfillmentKind: 'physical', defaultPrice: EUR(900), actor,
    }))
    const draft = checkSellable(product, product.variants[0]!.id, { listingPublished: null, availableInventory: null, now })
    expect(draft.sellable).toBe(false)
    expect(draft.reasons[0]).toMatch(/draft/)
    const ghost = checkSellable(product, newVariantId(), { listingPublished: null, availableInventory: null, now })
    expect(ghost.reasons[0]).toMatch(/does not exist/)
  })
})

describe('event contract coverage (M-6 from first emit)', () => {
  it('every COMMERCE_EVENT constant has a registered payload schema', () => {
    for (const eventType of Object.values(COMMERCE_EVENT)) {
      expect(COMMERCE_EVENT_PAYLOADS[eventType], `missing schema for ${eventType}`).toBeDefined()
    }
  })

  it('the registry lock is compatible with kernel + commerce schemas combined', () => {
    const current = Object.fromEntries(
      Object.keys(COMMERCE_EVENT_PAYLOADS).map((k) => [k, 1]),
    )
    const commerceLockEntries = Object.fromEntries(
      Object.entries(registryLock.events).filter(([k]) => k.startsWith('commerce.')),
    )
    expect(checkEventRegistryCompatibility(commerceLockEntries, current)).toHaveLength(0)
  })
})
