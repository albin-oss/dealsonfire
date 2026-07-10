/**
 * IgniteIntelligence (UI-COM-002 §3) — the PORT the journey talks to, with a
 * deterministic rule-based implementation behind it. When the AI domain lands, an
 * LLM-backed implementation replaces `ruleBasedIntelligence` without touching the
 * journey. Honesty law (UX-BIBLE §7.1): this engine never invents facts — every
 * evidence line cites the merchant's own words or a declared default, and
 * confidence is 'estimate'/'guess' where the rules are guessing.
 */

export type Fulfillment = 'physical' | 'digital' | 'service'
export type Personality = 'warm' | 'crisp' | 'playful'

export interface IdeaReading {
  /** The salient word of the idea ("blankets", "candles"). */
  subject: string
  category: string
  fulfillment: Fulfillment
  personality: Personality
  /** Did a rule actually match, or is this the fallback? Drives confidence. */
  matched: boolean
}

export interface IdentityDraft {
  name: string
  handle: string
  /** #rrggbb values — BrandKit DATA (merchant brand values), not UI tokens. */
  palette: { primary: string; surface: string; text: string } // token-gate-allow
  voice: string
}

export interface RevealItem {
  id: string
  label: string
  detail: string
  /** Merchant can exclude any item (the Bundle law, ADR-005 §2.3). */
  included: boolean
  /** Advanced-only items stay behind the Advanced drawer (§6). */
  advanced: boolean
}

export interface IgniteIntelligence {
  readIdea: (idea: string) => IdeaReading
  draftIdentities: (idea: string) => IdentityDraft[]
  draftReveal: (reading: IdeaReading, identity: IdentityDraft) => RevealItem[]
}

interface CategoryRule {
  keywords: string[]
  category: string
  fulfillment: Fulfillment
  personality: Personality
}

const RULES: CategoryRule[] = [
  { keywords: ['soap', 'candle', 'ceramic', 'pottery', 'knit', 'blanket', 'crochet', 'jewel', 'craft', 'handmade', 'wood'], category: 'Handmade & Home', fulfillment: 'physical', personality: 'warm' },
  { keywords: ['cake', 'bread', 'jam', 'sauce', 'coffee', 'tea', 'food', 'bak', 'cook', 'meal'], category: 'Food & Drink', fulfillment: 'physical', personality: 'warm' },
  { keywords: ['cloth', 'shirt', 'dress', 'fashion', 'vintage', 'sneaker', 'bag', 'apparel'], category: 'Fashion & Vintage', fulfillment: 'physical', personality: 'crisp' },
  { keywords: ['preset', 'template', 'ebook', 'course', 'digital', 'download', 'font', 'icon', 'music', 'beat'], category: 'Digital Goods', fulfillment: 'digital', personality: 'crisp' },
  { keywords: ['clean', 'repair', 'lesson', 'coach', 'photo session', 'consult', 'service', 'tutor', 'massage'], category: 'Services', fulfillment: 'service', personality: 'crisp' },
  { keywords: ['toy', 'game', 'sticker', 'print', 'art', 'plush'], category: 'Art & Play', fulfillment: 'physical', personality: 'playful' },
]

const STOPWORDS = new Set(['my', 'the', 'a', 'an', 'i', 'sell', 'make', 'made', 'hand', 'want', 'to', 'some', 'and', 'of', 'for', 'our', 'we'])

function salientWord(idea: string): string {
  const words = idea.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').split(/\s+/).filter(Boolean)
  const meaningful = words.filter((w) => !STOPWORDS.has(w) && w.length > 2)
  // prefer the last meaningful noun-ish word ("knitted baby blankets" → "blankets")
  return meaningful.at(-1) ?? words.at(-1) ?? 'goods'
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

export function slugify(text: string): string {
  const slug = text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/^-+|-+$/g, '')
  return slug.length >= 3 ? slug : `${slug}co`.padEnd(3, '0')
}

/** Per-personality curated palettes — BrandKit sample DATA (#rrggbb by contract). */
const PALETTES: Record<Personality, IdentityDraft['palette'][]> = {
  warm: [
    { primary: '#9a4b23', surface: '#faf5ef', text: '#3c2a1e' }, // token-gate-allow
    { primary: '#7a5c3e', surface: '#f7f3ec', text: '#332a20' }, // token-gate-allow
    { primary: '#8c3f2f', surface: '#fbf4f0', text: '#38251f' }, // token-gate-allow
  ],
  crisp: [
    { primary: '#1f4e5f', surface: '#f6f8f8', text: '#1d2a2e' }, // token-gate-allow
    { primary: '#31456b', surface: '#f5f6fa', text: '#20263a' }, // token-gate-allow
    { primary: '#2f5d50', surface: '#f4f8f6', text: '#1f2e28' }, // token-gate-allow
  ],
  playful: [
    { primary: '#b1451f', surface: '#fdf6ee', text: '#33231a' }, // token-gate-allow
    { primary: '#6d4796', surface: '#f9f6fc', text: '#2c2338' }, // token-gate-allow
    { primary: '#1e6e8c', surface: '#f2f9fb', text: '#1c2b31' }, // token-gate-allow
  ],
}

const VOICES: Record<Personality, string> = {
  warm: 'warm and personal — like a note tucked into the parcel',
  crisp: 'clear and confident — say it once, say it well',
  playful: 'bright and friendly — a smile in every sentence',
}

export const ruleBasedIntelligence: IgniteIntelligence = {
  readIdea(idea) {
    const folded = idea.toLowerCase()
    for (const rule of RULES) {
      if (rule.keywords.some((k) => folded.includes(k))) {
        return { subject: salientWord(idea), category: rule.category, fulfillment: rule.fulfillment, personality: rule.personality, matched: true }
      }
    }
    return { subject: salientWord(idea), category: 'General Goods', fulfillment: 'physical', personality: 'warm', matched: false }
  },

  draftIdentities(idea) {
    const reading = this.readIdea(idea)
    const word = titleCase(reading.subject)
    const names = [`${word} & Co.`, `The ${word} Studio`, `${word} Lane`]
    return names.map((name, index) => ({
      name,
      handle: slugify(name),
      palette: PALETTES[reading.personality][index]!,
      voice: VOICES[reading.personality],
    }))
  },

  draftReveal(reading, identity) {
    const items: RevealItem[] = [
      { id: 'structure', label: 'Store structure', detail: 'Home · Shop · About — three pages, nothing to configure', included: true, advanced: false },
      { id: 'category', label: 'Starting category', detail: `“${reading.category}” — customers browse; you can rename anytime`, included: true, advanced: false },
      { id: 'homepage', label: 'Homepage', detail: `Your ${reading.subject} up front, your story below — the default is designer-grade, not a placeholder`, included: true, advanced: false },
      { id: 'brand', label: 'Brand voice', detail: identity.voice, included: true, advanced: false },
    ]
    if (reading.fulfillment === 'physical') {
      items.push(
        { id: 'shipping', label: 'Shipping starting point', detail: 'Flat rate to your region — a named default you tune later; rates are money, so nothing binds without you', included: true, advanced: false },
        { id: 'inventory', label: 'Inventory', detail: 'Off until it earns its keep — DOF proposes tracking at the first oversell risk', included: true, advanced: true },
      )
    }
    if (reading.fulfillment === 'digital') {
      items.push({ id: 'delivery', label: 'Delivery', detail: 'Instant download after purchase — no shipping anywhere in your workspace', included: true, advanced: false })
    }
    items.push(
      { id: 'returns', label: 'Return policy draft', detail: 'A fair, human-readable default — DISPLAYED now, binding only after you review it (before your first sale)', included: true, advanced: false },
      { id: 'navigation', label: 'Navigation', detail: 'Derived from your catalog — grows as you add collections', included: true, advanced: true },
    )
    return items
  },
}
