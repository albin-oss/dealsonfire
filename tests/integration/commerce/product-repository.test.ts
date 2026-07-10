/** PgProductRepository — whole-aggregate persistence against real PostgreSQL (IMP-COM-001B). */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setContainer, type Container } from '../../../server/utils/container'
import { newTestContainer, truncateAll } from '../../helpers/pg'
import { createProduct, fromDraft } from '@domains/commerce/catalog/domain/factories/product-factory'
import { asBusinessId } from '@domains/merchant/shared-kernel/ids'
import { asProductId } from '@domains/commerce/shared-kernel/ids'
import type { Actor } from '@domains/merchant/shared-kernel/actor'
import { unwrap } from '@shared/result'
import { uuidv7 } from '@platform/uuid'

let container: Container
const actor: Actor = { type: 'user', id: uuidv7() }
const businessId = asBusinessId(uuidv7())
const EUR = (amount: number) => ({ amount, currency: 'EUR' })

beforeAll(() => {
  container = newTestContainer()
  setContainer(container)
})
afterAll(async () => {
  setContainer(null)
  await container.shutdown()
})
beforeEach(() => truncateAll(container.pool))

function richProduct() {
  return unwrap(createProduct({
    businessId, title: 'Wool Socks', fulfillmentKind: 'physical', actor,
    description: { format: 'markdown', content: 'Warm **wool** socks.' },
    categoryRef: 'apparel/socks',
    attributes: { brand: 'DOF Wool Co' },
    options: [{ name: 'Size', values: ['S', 'M'] }],
    variants: [
      { sku: 'SOCK-S', optionValues: { Size: 'S' }, price: EUR(2000),
        sale: { amount: 1500, startsAt: new Date('2026-08-01T00:00:00Z'), endsAt: new Date('2026-08-31T00:00:00Z') },
        kindData: { weight_grams: 80 } },
      { sku: 'SOCK-M', optionValues: { Size: 'M' }, price: EUR(2100) },
    ],
    media: [{ mediaId: uuidv7(), role: 'hero', altText: 'Socks on a table' }, { mediaId: uuidv7() }],
  })).product
}

describe('whole-aggregate round-trip', () => {
  it('insert → load reproduces every field, child, and VO exactly', async () => {
    const original = richProduct()
    await container.commerce.deps.uow.withTransaction((tx) => container.commerce.deps.products.insert(tx, original))

    const loaded = await container.commerce.deps.uow.withTransaction((tx) =>
      container.commerce.deps.products.findById(tx, original.id))
    expect(loaded).not.toBeNull()
    expect(loaded!.title as string).toBe('Wool Socks')
    expect(loaded!.description?.content).toBe('Warm **wool** socks.')
    expect(loaded!.categoryRef as string).toBe('apparel/socks')
    expect(loaded!.options[0]!.values).toEqual(['S', 'M'])
    expect(loaded!.variants).toHaveLength(2)
    const small = loaded!.variants.find((v) => v.sku === 'SOCK-S')!
    expect(small.price.amount).toBe(2000)
    expect(small.sale?.amount).toBe(1500)
    expect(small.sale?.startsAt.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(small.kindData).toEqual({ weight_grams: 80 })
    expect(loaded!.media).toHaveLength(2)
    expect(loaded!.media[0]!.role).toBe('hero')
    expect(loaded!.media[0]!.altText).toBe('Socks on a table')
    expect(loaded!.validate()).toHaveLength(0)
  })

  it('provenance survives the round-trip (fromDraft product)', async () => {
    const draft = unwrap(fromDraft({
      title: 'AI Soap', fulfillment_kind: 'physical', price: EUR(900),
      provenance: { model: 'claude-fable-5', promptVersion: 'v1' },
    }, businessId, actor)).product
    await container.commerce.deps.uow.withTransaction((tx) => container.commerce.deps.products.insert(tx, draft))
    const loaded = await container.commerce.deps.uow.withTransaction((tx) =>
      container.commerce.deps.products.findById(tx, draft.id))
    expect(loaded!.aiProvenance['title']?.model).toBe('claude-fable-5')
  })

  it('update replaces children with stable ids; mutations survive', async () => {
    const product = richProduct()
    await container.commerce.deps.uow.withTransaction((tx) => container.commerce.deps.products.insert(tx, product))
    const variantId = product.variants[0]!.id

    await container.commerce.deps.uow.withTransaction(async (tx) => {
      const loaded = (await container.commerce.deps.products.findById(tx, product.id, { forUpdate: true }))!
      expect(loaded.rename('Merino Socks', actor).ok).toBe(true)
      expect(loaded.updateVariant(variantId, { price: EUR(2500), sale: null }, actor).ok).toBe(true)
      await container.commerce.deps.products.update(tx, loaded)
    })

    const reloaded = await container.commerce.deps.uow.withTransaction((tx) =>
      container.commerce.deps.products.findById(tx, product.id))
    expect(reloaded!.title as string).toBe('Merino Socks')
    const variant = reloaded!.variants.find((v) => v.id === variantId)!
    expect(variant.price.amount).toBe(2500)
    expect(variant.sale).toBeNull()
    // child ids stable across replace-save
    expect(reloaded!.variants.map((v) => v.id).sort()).toEqual(product.variants.map((v) => v.id).sort())
  })

  it('missing product → null; countActiveByBusiness excludes archived', async () => {
    expect(await container.commerce.deps.uow.withTransaction((tx) =>
      container.commerce.deps.products.findById(tx, asProductId(uuidv7())))).toBeNull()

    const a = richProduct()
    const b = unwrap(createProduct({ businessId, title: 'B', fulfillmentKind: 'physical', defaultPrice: EUR(1), actor })).product
    b.archive(actor)
    await container.commerce.deps.uow.withTransaction(async (tx) => {
      await container.commerce.deps.products.insert(tx, a)
      await container.commerce.deps.products.insert(tx, b)
    })
    expect(await container.commerce.deps.uow.withTransaction((tx) =>
      container.commerce.deps.products.countActiveByBusiness(tx, businessId))).toBe(1)
  })

  it('rehydration guard: a corrupt row set throws loudly (ADR-004 rule 23)', async () => {
    const product = richProduct()
    await container.commerce.deps.uow.withTransaction((tx) => container.commerce.deps.products.insert(tx, product))
    // Corrupt beneath the app with something the DB constraints CANNOT catch: option
    // values outside the declared option space (I2 — validator-only territory).
    // (Duplicate SKUs are impossible even via raw SQL — uq_variants_business_sku holds,
    // which is rule 23's DB line doing its job.)
    await container.pool.query(
      `UPDATE product_variants SET option_values = '{"Ghost": "X"}' WHERE product_id = $1 AND sku = 'SOCK-M'`, [product.id])
    await expect(container.commerce.deps.uow.withTransaction((tx) =>
      container.commerce.deps.products.findById(tx, product.id))).rejects.toThrow(/corrupt products row/)
  })

  it('DB constraints hold: business-wide SKU uniqueness translated to SKU_TAKEN (I4 big brother, D-31)', async () => {
    const a = richProduct()
    await container.commerce.deps.uow.withTransaction((tx) => container.commerce.deps.products.insert(tx, a))
    const clash = unwrap(createProduct({
      businessId, title: 'Clash', fulfillmentKind: 'physical', actor,
      variants: [{ sku: 'SOCK-S', price: EUR(1) }],
    })).product
    // The constraint still fires — but the repository answers in merchant language (D-31),
    // carrying the stable code the HTTP layer maps to 409.
    const thrown = await container.commerce.deps.uow.withTransaction((tx) =>
      container.commerce.deps.products.insert(tx, clash)).then(() => null, (e: unknown) => e)
    expect(thrown).toMatchObject({ code: 'SKU_TAKEN', message: expect.stringContaining('SOCK-S') })
  })
})
