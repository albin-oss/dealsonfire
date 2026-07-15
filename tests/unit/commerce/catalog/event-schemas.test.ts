/**
 * Commerce event schema NEGATIVE tests (IMP-COM-001A: "no invalid event payload can pass
 * validation"). The positive direction — every emitted payload passes — is covered in
 * product-factory.test.ts; this file proves the schemas actually reject corruption,
 * because a validator that accepts everything is worse than none (M-6 depends on these
 * schemas dead-lettering poison events).
 */
import { describe, it, expect } from 'vitest'
import { COMMERCE_EVENT_PAYLOADS, commercePayloadValidators } from '@contracts/schemas/events/commerce-payloads'
import { COMMERCE_EVENT } from '@domains/commerce/catalog/domain/events'
import { uuidv7 } from '@platform/uuid'

const validators = commercePayloadValidators()
const uuid = uuidv7()

/** A valid baseline payload per event type — each corruption below mutates ONE field. */
const VALID: Record<string, Record<string, unknown>> = {
  'commerce.listing.published': { listing_id: uuid, product_id: uuid, business_id: uuid, channel_id: uuid },
  'commerce.listing.unpublished': { listing_id: uuid, product_id: uuid, business_id: uuid, channel_id: uuid },
  'commerce.listing.ended': { listing_id: uuid, product_id: uuid, business_id: uuid, channel_id: uuid },
  [COMMERCE_EVENT.PRODUCT_CREATED]: {
    product_id: uuid, business_id: uuid, title: 'Soap', fulfillment_kind: 'physical',
    category_path: null, status: 'draft', variant_count: 1, source: 'manual',
  },
  [COMMERCE_EVENT.PRODUCT_UPDATED]: {
    product_id: uuid, business_id: uuid, fields_changed: ['title'], status: 'draft',
  },
  [COMMERCE_EVENT.PRODUCT_ARCHIVED]: { product_id: uuid, business_id: uuid },
  [COMMERCE_EVENT.VARIANT_ADDED]: {
    product_id: uuid, business_id: uuid, variant_id: uuid, sku: 'DOF-1', option_values: { Size: 'M' },
  },
  [COMMERCE_EVENT.VARIANT_UPDATED]: {
    product_id: uuid, business_id: uuid, variant_id: uuid, fields_changed: ['price'],
  },
  [COMMERCE_EVENT.VARIANT_PRICE_CHANGED]: {
    product_id: uuid, business_id: uuid, variant_id: uuid,
    old_price: { amount: 100, currency: 'EUR' }, new_price: { amount: 90, currency: 'EUR' },
    sale_active: false, source: 'manual',
  },
  [COMMERCE_EVENT.PRODUCT_MEDIA_ADDED]: {
    product_id: uuid, business_id: uuid, product_media_id: uuid, media_id: uuid,
    variant_id: null, role: 'gallery',
  },
  [COMMERCE_EVENT.PRODUCT_MEDIA_REMOVED]: {
    product_id: uuid, business_id: uuid, product_media_id: uuid, media_id: uuid,
  },
}

describe('every commerce schema accepts its valid baseline', () => {
  it.each(Object.keys(COMMERCE_EVENT_PAYLOADS))('%s', (eventType) => {
    expect(VALID[eventType], `baseline fixture for ${eventType}`).toBeDefined()
    expect(validators[eventType]!(VALID[eventType])).toEqual({ ok: true })
  })
})

describe('single-field corruptions are rejected (M-6 teeth)', () => {
  const reject = (eventType: string, mutation: Record<string, unknown>, label: string) => {
    const payload = { ...VALID[eventType], ...mutation }
    const result = validators[eventType]!(payload)
    expect(result.ok, `${eventType} should reject ${label}`).toBe(false)
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0) // explainable, not just false
  }

  it('non-uuid identifiers', () => {
    reject(COMMERCE_EVENT.PRODUCT_CREATED, { product_id: 'not-a-uuid' }, 'non-uuid product_id')
    reject(COMMERCE_EVENT.VARIANT_ADDED, { variant_id: 42 }, 'numeric variant_id')
    reject(COMMERCE_EVENT.PRODUCT_MEDIA_ADDED, { media_id: '' }, 'empty media_id')
  })

  it('missing required fields', () => {
    for (const eventType of Object.keys(VALID)) {
      const { business_id: _dropped, ...withoutBusiness } = VALID[eventType]!
      const result = validators[eventType]!(withoutBusiness)
      expect(result.ok, `${eventType} without business_id`).toBe(false)
    }
  })

  it('enum violations', () => {
    reject(COMMERCE_EVENT.PRODUCT_CREATED, { fulfillment_kind: 'quantum' }, 'bad fulfillment_kind')
    reject(COMMERCE_EVENT.PRODUCT_CREATED, { status: 'published' }, 'listing-status leaking into product status')
    reject(COMMERCE_EVENT.PRODUCT_CREATED, { source: 'imported' }, 'unknown source')
    reject(COMMERCE_EVENT.PRODUCT_MEDIA_ADDED, { role: 'banner' }, 'unknown media role')
    reject(COMMERCE_EVENT.VARIANT_PRICE_CHANGED, { source: 'api' }, 'unknown price-change source')
  })

  it('money shape violations (rule 8: integer minor units, 3-char currency)', () => {
    reject(COMMERCE_EVENT.VARIANT_PRICE_CHANGED, { new_price: { amount: 9.99, currency: 'EUR' } }, 'float money')
    reject(COMMERCE_EVENT.VARIANT_PRICE_CHANGED, { new_price: { amount: -1, currency: 'EUR' } }, 'negative money')
    reject(COMMERCE_EVENT.VARIANT_PRICE_CHANGED, { old_price: { amount: 100, currency: 'EURO' } }, '4-char currency')
  })

  it('structural violations', () => {
    reject(COMMERCE_EVENT.PRODUCT_UPDATED, { fields_changed: [] }, 'empty fields_changed')
    reject(COMMERCE_EVENT.PRODUCT_UPDATED, { fields_changed: 'title' }, 'string instead of array')
    reject(COMMERCE_EVENT.VARIANT_ADDED, { option_values: [['Size', 'M']] }, 'array instead of record')
    reject(COMMERCE_EVENT.VARIANT_ADDED, { sku: '' }, 'empty sku')
    reject(COMMERCE_EVENT.PRODUCT_CREATED, { variant_count: 0 }, 'zero variant_count (I1 echo)')
  })

  it('unknown EXTRA fields are tolerated (ADR-003 §4 — additive evolution)', () => {
    const extended = { ...VALID[COMMERCE_EVENT.PRODUCT_ARCHIVED], future_field: 'v2 addition' }
    expect(validators[COMMERCE_EVENT.PRODUCT_ARCHIVED]!(extended)).toEqual({ ok: true })
  })
})
