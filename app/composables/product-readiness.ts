/**
 * Product Readiness engine (UX-AUTHOR-002 §E). Confidence, not completeness: secured facts
 * (✓ + why) and at most TWO invitations (○ + honest reason, never blocking). Publishable is
 * the DOMAIN's own bar — title + price — never more. No counts, no percent, no urgency.
 * Persona-informed (PROMPT-024 validation): digital products get an honest delivery note.
 */
export interface ReadinessItem {
  id: string
  label: string
  why: string
  state: 'secured' | 'invited'
}

export interface ReadinessDraft {
  title: string
  priceMinor: number | null
  kind: 'physical' | 'digital' | 'service'
  categoryAccepted: boolean
  descriptionAccepted: boolean
  mediaCount: number
}

export function productReadiness(draft: ReadinessDraft): { items: ReadinessItem[]; publishable: boolean } {
  const items: ReadinessItem[] = []

  if (draft.title.trim().length > 0) {
    items.push({ id: 'title', label: 'Title', why: 'Buyers know what it is.', state: 'secured' })
  }
  if (draft.priceMinor !== null && draft.priceMinor > 0) {
    items.push({ id: 'price', label: 'Price', why: 'They know what it costs — and you can change it anytime.', state: 'secured' })
  }
  if (draft.categoryAccepted) {
    items.push({ id: 'category', label: 'Category', why: 'Helps people find it.', state: 'secured' })
  }
  if (draft.mediaCount > 0) {
    items.push({ id: 'photo', label: 'Photo', why: 'They can see it — the strongest yes.', state: 'secured' })
  }
  if (draft.descriptionAccepted) {
    items.push({ id: 'description', label: 'Description', why: 'A sentence that helps buyers fall for it.', state: 'secured' })
  }

  // invitations: honest reasons, never blocking, capped at two (more is a checklist)
  const invitations: ReadinessItem[] = []
  if (draft.mediaCount === 0) {
    invitations.push({ id: 'photo', label: 'Photo', why: 'Products with photos sell better — add one anytime.', state: 'invited' })
  }
  if (!draft.descriptionAccepted) {
    invitations.push({ id: 'description', label: 'Description', why: 'One sentence helps buyers fall for it.', state: 'invited' })
  }
  if (draft.kind === 'digital' && invitations.length < 2) {
    invitations.push({ id: 'delivery', label: 'Delivery', why: 'Buyers will reach you for the file for now — automatic delivery is coming.', state: 'invited' })
  }
  items.push(...invitations.slice(0, 2))

  return {
    items,
    publishable: draft.title.trim().length > 0 && draft.priceMinor !== null && draft.priceMinor > 0,
  }
}
