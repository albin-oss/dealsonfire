/**
 * AttributeSet + BrandRef pure domain (PROMPT-016). Typed attribute validation, versioned
 * transitions, rehydration guard, and brand-ref validation. No DB, no framework.
 */
import { describe, it, expect } from 'vitest'
import { AttributeSet, createDefinitions } from '@domains/commerce/catalog/domain/attribute-set'
import { createBrandRef } from '@domains/commerce/catalog/domain/brand-ref'
import { newAttributeSetId, newBrandRefId } from '@domains/commerce/shared-kernel/ids'
import { asBusinessId } from '@domains/merchant/shared-kernel/ids'
import { uuidv7 } from '@platform/uuid'

const biz = asBusinessId(uuidv7())
const defs = () => {
  const r = createDefinitions([
    { key: 'material', label: 'Material', type: 'text', required: true },
    { key: 'gift_wrap', label: 'Gift wrap', type: 'boolean', required: false },
    { key: 'size', label: 'Size', type: 'select', required: false, allowedValues: ['s', 'm', 'l'] },
  ])
  if (!r.ok) throw new Error('defs')
  return r.value
}
const set = () => {
  const r = AttributeSet.create({ id: newAttributeSetId(), businessId: biz, name: 'Apparel', definitions: defs() })
  if (!r.ok) throw new Error('set')
  return r.value
}

describe('createDefinitions', () => {
  it('accepts valid defs; rejects bad keys, dupes, and select without values', () => {
    expect(createDefinitions([{ key: 'x', label: 'X', type: 'text', required: false }]).ok).toBe(true)
    expect(createDefinitions([{ key: 'Bad Key', label: 'X', type: 'text' }]).ok).toBe(false)
    expect(createDefinitions([{ key: 'a', label: 'A', type: 'text' }, { key: 'a', label: 'A2', type: 'text' }]).ok).toBe(false)
    expect(createDefinitions([{ key: 's', label: 'S', type: 'select' }]).ok).toBe(false)
  })
})

describe('AttributeSet.validate (typed product attributes)', () => {
  it('accepts a valid attribute bag and drops absent optionals', () => {
    const r = set().validate({ material: 'wool', size: 'm' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual({ material: 'wool', size: 'm' })
  })
  it('rejects unknown keys', () => {
    const r = set().validate({ material: 'wool', unknown: 1 })
    expect(r.ok).toBe(false)
  })
  it('enforces required attributes', () => {
    expect(set().validate({ gift_wrap: true }).ok).toBe(false) // missing required material
  })
  it('enforces types and select membership', () => {
    expect(set().validate({ material: 123 }).ok).toBe(false) // material must be text
    expect(set().validate({ material: 'x', gift_wrap: 'yes' }).ok).toBe(false) // boolean
    expect(set().validate({ material: 'x', size: 'xl' }).ok).toBe(false) // not an allowed value
  })
})

describe('AttributeSet transitions', () => {
  it('rename is detected-change; archive is idempotent; both bump version', () => {
    const s = set()
    expect(s.sequence).toBe(0)
    expect(s.rename('Apparel')).toEqual({ ok: true, value: false }) // no-op
    expect(s.rename('Clothing')).toEqual({ ok: true, value: true })
    expect(s.sequence).toBe(1)
    expect(s.archive()).toBe(true)
    expect(s.status).toBe('archived')
    expect(s.archive()).toBe(false)
  })
  it('rehydration refuses a corrupt row', () => {
    expect(() => AttributeSet.rehydrate({ id: newAttributeSetId(), businessId: biz, name: 'x', definitions: [], status: 'zombie' as 'active', sequence: 0 })).toThrow(/corrupt/)
    expect(() => AttributeSet.rehydrate({ id: newAttributeSetId(), businessId: biz, name: 'x', definitions: [], status: 'active', sequence: -1 })).toThrow(/corrupt/)
  })
})

describe('BrandRef', () => {
  it('validates name bounds', () => {
    expect(createBrandRef({ id: newBrandRefId(), businessId: biz, name: '  Nike  ' })).toMatchObject({ ok: true, value: { name: 'Nike' } })
    expect(createBrandRef({ id: newBrandRefId(), businessId: biz, name: '' }).ok).toBe(false)
  })
})
