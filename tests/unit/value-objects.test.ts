import { describe, it, expect } from 'vitest'
import { createPrice } from '@domains/merchant/shared-kernel/price'
import { createHandle } from '@domains/merchant/shared-kernel/handle'
import { createBrandKit } from '@domains/merchant/shared-kernel/brand-kit'
import { createMediaRef } from '@domains/merchant/shared-kernel/media-ref'
import { uuidv7, isUuid } from '@domains/merchant/shared-kernel/uuid'
import { markFieldAIGenerated, approveField, EMPTY_PROVENANCE } from '@domains/merchant/shared-kernel/ai-provenance'

describe('Price VO (A3: integer minor units, never floats)', () => {
  it('accepts non-negative integers with ISO currency', () => {
    const price = createPrice(3200, 'EUR')
    expect(price.ok && price.value.amount).toBe(3200)
  })
  it.each([[32.5, 'EUR'], [-1, 'EUR'], [Number.MAX_SAFE_INTEGER + 1, 'EUR']])('rejects %s', (amount) => {
    expect(createPrice(amount as number, 'EUR').ok).toBe(false)
  })
  it('rejects non-ISO currency', () => {
    expect(createPrice(100, 'eur').ok).toBe(false)
    expect(createPrice(100, 'EURO').ok).toBe(false)
  })
})

describe('Handle VO', () => {
  it('normalizes to lowercase', () => {
    const handle = createHandle('  RosasKnits ')
    expect(handle.ok && (handle.value as string)).toBe('rosasknits')
  })
  it.each(['ab', 'a'.repeat(31), '-bad', 'bad-', 'has--double', 'has spaces', 'ümläut'])('rejects invalid "%s"', (raw) => {
    expect(createHandle(raw).ok).toBe(false)
  })
  it('rejects reserved words including spark/sparks (Community brand language)', () => {
    for (const reserved of ['spark', 'sparks', 'admin', 'ignite', 'shop']) {
      const result = createHandle(reserved)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('HANDLE_TAKEN')
    }
  })
})

describe('BrandKit VO', () => {
  it('requires a name and validates palette colors', () => {
    expect(createBrandKit({ name: '' }).ok).toBe(false)
    expect(createBrandKit({ name: 'Rosa', palette: { primary: 'red' } }).ok).toBe(false)
    const kit = createBrandKit({ name: 'Rosa', palette: { primary: '#FF4500' } })
    expect(kit.ok && kit.value.palette.primary).toBe('#FF4500')
  })
  it('validates logo media reference as UUID (MediaRef, never URL)', () => {
    expect(createBrandKit({ name: 'Rosa', logoMediaId: 'https://cdn.example/logo.png' }).ok).toBe(false)
    expect(createBrandKit({ name: 'Rosa', logoMediaId: uuidv7() }).ok).toBe(true)
  })
})

describe('MediaRef VO', () => {
  it('accepts uuid + variant hint, rejects URLs', () => {
    expect(createMediaRef(uuidv7(), 'thumb').ok).toBe(true)
    expect(createMediaRef('https://x.example/img.png').ok).toBe(false)
  })
})

describe('uuidv7', () => {
  it('produces valid, time-ordered uuids', () => {
    const a = uuidv7(1000)
    const b = uuidv7(2000)
    expect(isUuid(a)).toBe(true)
    expect(a < b).toBe(true)
    expect(a[14]).toBe('7') // version nibble
  })
})

describe('AIProvenance (ADR §13.3 auditability)', () => {
  it('tracks generation and human approval per field', () => {
    let provenance = markFieldAIGenerated(EMPTY_PROVENANCE, 'description', {
      model: 'claude-fable-5', promptVersion: 'v1', humanApproved: false,
    })
    expect(provenance.description?.humanApproved).toBe(false)
    provenance = approveField(provenance, 'description')
    expect(provenance.description?.humanApproved).toBe(true)
  })
})
