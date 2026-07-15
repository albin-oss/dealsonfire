/**
 * Listing (VISIBILITY_CONTRACT §5/§6; ADR-002 §0.3 third machine). The (product × channel)
 * publication fact: the merchant's standing INTENT that a product be sellable on a channel.
 * PURE: the machine + detected-change transitions. Visibility is NEVER stored here — it is
 * the conjunction computed at read time (V1). One row per product×channel (V2, DB-enforced).
 */
export type ListingStatus = 'published' | 'unpublished' | 'ended'

export const LISTING_STATUS_TRANSITIONS: Record<ListingStatus, readonly ListingStatus[]> = {
  published: ['unpublished', 'ended'],
  unpublished: ['published', 'ended'],
  ended: ['published'], // republish after product restore (VISIBILITY_CONTRACT §6)
}

export interface ListingProps {
  id: string
  businessId: string
  productId: string
  channelId: string
  status: ListingStatus
  publishedAt: Date | null
  endedAt: Date | null
}

export class Listing {
  private constructor(private readonly props: ListingProps) {}

  /** A fresh listing born published — publishToStore auto-creates (§6). */
  static publish(input: { id: string; businessId: string; productId: string; channelId: string }, now: Date): Listing {
    return new Listing({ ...input, status: 'published', publishedAt: now, endedAt: null })
  }

  static rehydrate(props: ListingProps): Listing {
    if (!props.id || !props.businessId || !props.productId || !props.channelId) {
      throw new Error(`corrupt listing row (${props.id}): missing identity`)
    }
    if (!(props.status in LISTING_STATUS_TRANSITIONS)) {
      throw new Error(`corrupt listing row (${props.id}): status=${props.status}`)
    }
    return new Listing(props)
  }

  get id() { return this.props.id }
  get businessId() { return this.props.businessId }
  get productId() { return this.props.productId }
  get channelId() { return this.props.channelId }
  get status() { return this.props.status }
  get publishedAt() { return this.props.publishedAt }
  get endedAt() { return this.props.endedAt }

  /** Detected-change transitions (V4): return true iff something actually changed. */
  publishAgain(now: Date): boolean { return this.transition('published', now) }
  unpublish(now: Date): boolean { return this.transition('unpublished', now) }
  end(now: Date): boolean { return this.transition('ended', now) }

  private transition(to: ListingStatus, now: Date): boolean {
    if (this.props.status === to) return false // silent no-op — replays emit nothing
    if (!LISTING_STATUS_TRANSITIONS[this.props.status].includes(to)) return false
    this.props.status = to
    if (to === 'published') { this.props.publishedAt = now; this.props.endedAt = null }
    if (to === 'ended') this.props.endedAt = now
    return true
  }

  toProps(): ListingProps { return { ...this.props } }
}
