/**
 * FIX-COM-001A regression suite:
 *  M-2 — every mutation-emitted event validates against the registered schemas
 *        (the missing test class that let REVIEW-003 H-1 ship).
 *  H-1 — events describe DETECTED change; no-ops are silent (D-29).
 *  M-1 — provenance supersession on human edits (D-29).
 *  M-3 — I11 mutation-path limit guards.  L-1/L-6 — no-op reorder, option control chars.
 */
import { describe, it, expect } from 'vitest'
import { unwrap } from '@shared/result'
import { createProduct, fromDraft } from '@domains/commerce/catalog/domain/factories/product-factory'
import { Product, MAX_MEDIA_PER_PRODUCT } from '@domains/commerce/catalog/domain/product'
import { Variant } from '@domains/commerce/catalog/domain/variant'
import { createOption } from '@domains/commerce/shared-kernel/option'
import { commercePayloadValidators } from '@contracts/schemas/events/commerce-payloads'
import { newProductId, newVariantId } from '@domains/commerce/shared-kernel/ids'
import { asBusinessId } from '@domains/merchant/shared-kernel/ids'
import { createPrice } from '@domains/merchant/shared-kernel/price'
import { EMPTY_PROVENANCE } from '@domains/merchant/shared-kernel/ai-provenance'
import type { Actor } from '@domains/merchant/shared-kernel/actor'
import { uuidv7 } from '@platform/uuid'

const actor: Actor = { type: 'user', id: uuidv7() }
const businessId = asBusinessId(uuidv7())
const EUR = (amount: number) => ({ amount, currency: 'EUR' })
const validators = commercePayloadValidators()

function assertAllValid(product: Product, context: string): number {
  const events = product.pullPendingEvents()
  for (const event of events) {
    const validator = validators[event.eventType]
    expect(validator, `${context}: schema registered for ${event.eventType}`).toBeDefined()
    const result = validator!(event.payload)
    expect(result, `${context}: ${event.eventType} payload ${JSON.stringify(event.payload)}`).toEqual({ ok: true })
  }
  return events.length
}

describe('M-2: mutation-emissions × schema sweep — every behavior, every event, validated', () => {
  it('all twelve mutations emit only schema-valid events', () => {
    const { product, events: birthEvents } = unwrap(createProduct({
      businessId, title: 'Sweep Soap', fulfillmentKind: 'physical', defaultPrice: EUR(1500), actor,
    }))
    // birth events too (factory covered elsewhere, re-checked here for completeness)
    for (const event of birthEvents) expect(validators[event.eventType]!(event.payload)).toEqual({ ok: true })

    const variantId = product.variants[0]!.id
    expect(assertAllValid(rename(product), 'rename')).toBe(1)
    expect(assertAllValid(description(product), 'description')).toBe(1)
    expect(assertAllValid(category(product), 'category')).toBe(1)
    expect(assertAllValid(addOption(product, variantId), 'addOption')).toBe(1)
    expect(assertAllValid(addVariant(product), 'addVariant')).toBe(1)
    expect(assertAllValid(updateVariant(product, variantId), 'updateVariant')).toBe(2) // updated + price_changed
    expect(assertAllValid(removeOptionValue(product), 'removeOptionValue')).toBe(1)
    const mediaIds = addMedia(product)
    expect(assertAllValid(product, 'addMedia ×2')).toBe(2)
    expect(assertAllValid(reorderMedia(product, mediaIds), 'reorderMedia')).toBe(1)
    expect(assertAllValid(removeMedia(product, mediaIds[0]!), 'removeMedia')).toBe(1)
    expect(assertAllValid(archiveRestore(product), 'archive+restore')).toBe(2)
    expect(assertAllValid(removeOption(product), 'removeOption')).toBe(1)

    // helper mutations
    function rename(p: Product) { expect(p.rename('Renamed Soap', actor).ok).toBe(true); return p }
    function description(p: Product) { expect(p.updateDescription({ content: 'Nice.' }, actor).ok).toBe(true); return p }
    function category(p: Product) { expect(p.setCategory('home/soap', actor).ok).toBe(true); return p }
    function addOption(p: Product, vid: typeof variantId) {
      expect(p.addOption({ name: 'Scent', values: ['Lavender', 'Rose', 'Pine'] }, new Map([[vid, 'Lavender']]), actor).ok).toBe(true)
      return p
    }
    function addVariant(p: Product) {
      expect(p.addVariant({ price: EUR(1600), optionValues: { Scent: 'Rose' } }, actor).ok).toBe(true)
      return p
    }
    function updateVariant(p: Product, vid: typeof variantId) {
      expect(p.updateVariant(vid, { price: EUR(1800) }, actor).ok).toBe(true)
      return p
    }
    function removeOptionValue(p: Product) {
      expect(p.removeOptionValue('Scent', 'Pine', actor).ok).toBe(true)
      return p
    }
    function addMedia(p: Product) {
      const a = unwrap(p.addMedia({ mediaId: uuidv7() }, actor))
      const b = unwrap(p.addMedia({ mediaId: uuidv7(), role: 'hero' }, actor))
      return [a, b]
    }
    function reorderMedia(p: Product, ids: ReturnType<typeof addMedia>) {
      expect(p.reorderMedia([ids[1]!, ids[0]!], actor).ok).toBe(true)
      return p
    }
    function removeMedia(p: Product, id: ReturnType<typeof addMedia>[0]) {
      expect(p.removeMedia(id, actor).ok).toBe(true)
      return p
    }
    function archiveRestore(p: Product) {
      expect(p.archive(actor).ok).toBe(true)
      expect(p.restore(actor).ok).toBe(true)
      return p
    }
    function removeOption(p: Product) {
      // variants are (Lavender) and (Rose) — removing Scent would merge them; delete one first? No:
      // update one variant's scent... both distinct on Scent only, removal collapses → use the
      // legal path: this product's variants differ ONLY on Scent, so removal must fail — instead
      // re-add a distinguishing option then remove it (clean collapse).
      const assignments = new Map(p.variants.map((v, i) => [v.id, i === 0 ? 'A' : 'B'] as const))
      expect(p.addOption({ name: 'Grade', values: ['A', 'B'] }, assignments, actor).ok).toBe(true)
      p.pullPendingEvents() // drop the addOption event; we're testing removeOption's emission
      expect(p.removeOption('Grade', actor).ok).toBe(true)
      return p
    }
  })
})

describe('H-1 regression: events describe detected change; no-ops are silent (D-29)', () => {
  function soap() {
    return unwrap(createProduct({
      businessId, title: 'Soap', fulfillmentKind: 'physical', defaultPrice: EUR(1500), actor,
    })).product
  }

  it('updateVariant({}) emits NOTHING (previously emitted schema-invalid fields_changed: [])', () => {
    const product = soap()
    expect(product.updateVariant(product.variants[0]!.id, {}, actor).ok).toBe(true)
    expect(product.pullPendingEvents()).toHaveLength(0)
  })

  it('same-value price/sku/kindData updates emit NOTHING', () => {
    const product = soap()
    const variantId = product.variants[0]!.id
    const sku = product.variants[0]!.sku as string
    expect(product.updateVariant(variantId, { price: EUR(1500), sku, kindData: null }, actor).ok).toBe(true)
    expect(product.pullPendingEvents()).toHaveLength(0)
  })

  it('fields_changed lists only DETECTED deltas, not the request shape', () => {
    const product = soap()
    const variantId = product.variants[0]!.id
    const sku = product.variants[0]!.sku as string
    // Request mentions sku (unchanged) + price (changed) → only 'price' is reported
    expect(product.updateVariant(variantId, { sku, price: EUR(1800) }, actor).ok).toBe(true)
    const events = product.pullPendingEvents()
    expect(events.map((e) => e.eventType)).toEqual(['commerce.variant.updated', 'commerce.variant.price_changed'])
    expect((events[0]!.payload as { fields_changed: string[] }).fields_changed).toEqual(['price'])
  })

  it('sale-only changes emit price_changed; kind_data-only changes do not', () => {
    const product = soap()
    const variantId = product.variants[0]!.id
    expect(product.updateVariant(variantId, {
      sale: { amount: 900, startsAt: new Date('2026-08-01'), endsAt: new Date('2026-08-31') },
    }, actor).ok).toBe(true)
    expect(product.pullPendingEvents().map((e) => e.eventType))
      .toEqual(['commerce.variant.updated', 'commerce.variant.price_changed'])
    expect(product.updateVariant(variantId, { kindData: { weight_grams: 90 } }, actor).ok).toBe(true)
    expect(product.pullPendingEvents().map((e) => e.eventType)).toEqual(['commerce.variant.updated'])
  })

  it('L-1: reordering to the identical order emits nothing', () => {
    const product = soap()
    const a = unwrap(product.addMedia({ mediaId: uuidv7() }, actor))
    const b = unwrap(product.addMedia({ mediaId: uuidv7() }, actor))
    product.pullPendingEvents()
    expect(product.reorderMedia([a, b], actor).ok).toBe(true) // already the order
    expect(product.pullPendingEvents()).toHaveLength(0)
  })
})

describe('M-1 regression: provenance supersession on human edits (D-29)', () => {
  function draftProduct() {
    return unwrap(fromDraft({
      title: 'AI Title', description: 'AI description.', category_path: 'home/soap',
      fulfillment_kind: 'physical', price: EUR(1000),
      provenance: { model: 'claude-fable-5', promptVersion: 'v1' },
    }, businessId, actor)).product
  }

  it('editing an AI field clears its provenance; untouched fields keep theirs', () => {
    const product = draftProduct()
    expect(Object.keys(product.aiProvenance).sort()).toEqual(['category', 'description', 'price', 'title'])

    product.rename('Human Title', actor)
    expect(product.aiProvenance['title']).toBeUndefined()
    expect(product.aiProvenance['description']).toBeDefined() // untouched

    product.updateDescription({ content: 'Human words.' }, actor)
    expect(product.aiProvenance['description']).toBeUndefined()

    product.setCategory('home/candles', actor)
    expect(product.aiProvenance['category']).toBeUndefined()

    product.updateVariant(product.variants[0]!.id, { price: EUR(1100) }, actor)
    expect(product.aiProvenance['price']).toBeUndefined()
    expect(Object.keys(product.aiProvenance)).toHaveLength(0) // all superseded
  })

  it('no-op edits do NOT clear provenance (nothing was superseded)', () => {
    const product = draftProduct()
    product.rename('AI Title', actor) // same title — no-op
    expect(product.aiProvenance['title']).toBeDefined()
    product.updateVariant(product.variants[0]!.id, { price: EUR(1000) }, actor) // same price
    expect(product.aiProvenance['price']).toBeDefined()
  })
})

describe('M-3: I11 mutation-path limit guards', () => {
  it('the 101st variant is refused at addVariant', () => {
    const price = unwrap(createPrice(100, 'EUR'))
    const values = Array.from({ length: 50 }, (_, i) => `v${i}`)
    const optionA = unwrap(createOption('A', values))
    const optionB = unwrap(createOption('B', values))
    const variants = Array.from({ length: 100 }, (_, i) =>
      Variant.rehydrate({
        id: newVariantId(), sku: `S${i}` as never,
        optionValues: { A: `v${i % 50}`, B: `v${Math.floor(i / 50)}` },
        price, sale: null, kindData: null, position: i,
      }))
    const product = Product.rehydrate({
      id: newProductId(), businessId, title: 'Big' as never, description: null,
      fulfillmentKind: 'physical', categoryRef: null, attributes: {},
      options: [optionA, optionB], variants, media: [], status: 'draft', aiProvenance: EMPTY_PROVENANCE,
    })
    const result = product.addVariant({ price: EUR(100), optionValues: { A: 'v0', B: 'v2' } }, actor)
    expect(!result.ok && result.error.message).toMatch(/at most 100 variants/)
  })

  it(`the ${MAX_MEDIA_PER_PRODUCT + 1}th media item is refused at addMedia`, () => {
    const product = unwrap(createProduct({
      businessId, title: 'Gallery', fulfillmentKind: 'physical', defaultPrice: EUR(100), actor,
    })).product
    for (let i = 0; i < MAX_MEDIA_PER_PRODUCT; i++) {
      expect(product.addMedia({ mediaId: uuidv7() }, actor).ok).toBe(true)
    }
    const overflow = product.addMedia({ mediaId: uuidv7() }, actor)
    expect(!overflow.ok && overflow.error.message).toMatch(/at most 50 media/)
  })
})

describe('L-6: option names/values reject control characters', () => {
  it.each(['Si\tze', 'Size'])('rejects %j', (bad) => {
    expect(createOption(bad, ['S']).ok).toBe(false)
    expect(createOption('Size', [bad]).ok).toBe(false)
  })
})
