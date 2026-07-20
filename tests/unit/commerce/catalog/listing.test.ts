/**
 * Listing machine (VISIBILITY_CONTRACT §6/§19) — pure unit tests: the third machine's
 * transitions, detected-change silence, republish-after-end, and rehydration guards.
 */
import { describe, it, expect } from 'vitest'
import { Listing, LISTING_STATUS_TRANSITIONS } from '@domains/commerce/catalog/domain/listing'
import { uuidv7 } from '@platform/uuid'

const now = new Date('2026-07-13T12:00:00Z')
const born = () => Listing.publish({ id: uuidv7(), businessId: uuidv7(), productId: uuidv7(), channelId: uuidv7() }, now)

describe('the listing machine', () => {
  it('is born published with a timestamp (§6 auto-create)', () => {
    const l = born()
    expect(l.status).toBe('published')
    expect(l.publishedAt).toEqual(now)
  })

  it('publish ⇄ unpublish; transitions are detected-change (V4: replays are silent)', () => {
    const l = born()
    expect(l.publishAgain(now)).toBe(false) // already published — no event material
    expect(l.unpublish(now)).toBe(true)
    expect(l.unpublish(now)).toBe(false)    // replay-silent
    expect(l.publishAgain(now)).toBe(true)
    expect(l.status).toBe('published')
  })

  it('ends from either live state; republish after end (product restored) is allowed', () => {
    const l = born()
    expect(l.end(now)).toBe(true)
    expect(l.status).toBe('ended')
    expect(l.endedAt).toEqual(now)
    expect(l.unpublish(now)).toBe(false)    // ended → unpublished is not a transition
    const later = new Date('2026-07-14T12:00:00Z')
    expect(l.publishAgain(later)).toBe(true) // §6 republish-after-restore
    expect(l.publishedAt).toEqual(later)
    expect(l.endedAt).toBeNull()
  })

  it('declares exactly the contract transitions', () => {
    expect(LISTING_STATUS_TRANSITIONS).toEqual({
      published: ['unpublished', 'ended'],
      unpublished: ['published', 'ended'],
      ended: ['published'],
    })
  })

  it('rehydration refuses corrupt rows (identity + unknown status)', () => {
    expect(() => Listing.rehydrate({ id: '', businessId: uuidv7(), productId: uuidv7(), channelId: uuidv7(), status: 'published', publishedAt: now, endedAt: null })).toThrow(/corrupt/)
    expect(() => Listing.rehydrate({ id: uuidv7(), businessId: uuidv7(), productId: uuidv7(), channelId: uuidv7(), status: 'zombie' as 'published', publishedAt: now, endedAt: null })).toThrow(/corrupt/)
  })
})
