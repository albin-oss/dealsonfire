/**
 * Identity intelligence (Release 0.5) — advisory drafts for the merchant's story and
 * promise, in the authoring-intelligence idiom: deterministic, transparent, tappable.
 * AI suggests, the merchant decides — a draft is a starting sentence in THEIR mouth,
 * never copy that pretends to be them. Inputs are only what the merchant already gave
 * DOF (store name, tagline, what's on the shelf).
 */
export interface IdentityContext {
  storeName: string
  tagline: string | null
  productTitles: string[]
}

/** A story draft the merchant can accept, edit, or ignore. Null when there's nothing honest to say. */
export function draftStory(ctx: IdentityContext): string | null {
  const name = ctx.storeName.trim()
  if (!name) return null
  const things = ctx.productTitles.slice(0, 2).map((t) => t.toLowerCase())
  const making = things.length > 0 ? things.join(' and ') : 'what we sell'
  const toneLine = ctx.tagline?.trim() ? ` ${ctx.tagline.trim().replace(/\.?$/, '.')}` : ''
  return `${name} started small — one person who cared too much about ${making} to do it halfway.${toneLine} Every order is packed by the same hands that made the shop.`
}

/** Promise drafts — short enough to stand under a price. */
export function draftPromises(ctx: IdentityContext): string[] {
  const name = ctx.storeName.trim()
  if (!name) return []
  return [
    'If something isn’t right, we make it right — always.',
    'Made carefully, packed personally, sent with pride.',
    `Every ${ctx.productTitles.length > 0 ? 'piece' : 'order'} gets the attention we’d want ourselves.`,
  ]
}
