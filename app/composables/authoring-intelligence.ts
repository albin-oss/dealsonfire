/**
 * AuthoringIntelligence (UX-AUTHOR-001 §8). The Ignite-pattern port for product authoring:
 * rule-based today, provider-swappable later, ADVISORY always — every output is a proposal
 * the merchant taps to accept; ignoring all of them still publishes with two fields.
 * parseLine is the conversational opener's brain: "Lavender baby blanket, 45" → title+price.
 */
export type AuthoringKind = 'physical' | 'digital' | 'service'

export interface ParsedLine {
  title: string
  /** Minor units; null when the line carries no price. */
  priceMinor: number | null
}

/** "Lavender baby blanket, 45" | "Socks 12.50" | "Consulting call — €80" → title + price. */
export function parseLine(raw: string): ParsedLine {
  const line = raw.trim()
  if (!line) return { title: '', priceMinor: null }
  // price = a trailing number (with optional decimals), optionally preceded by ,/—/- and/or €
  const match = /^(.*?)(?:[,—-]\s*|\s+)€?\s*(\d+(?:[.,]\d{1,2})?)\s*€?$/.exec(line)
  if (!match || match[1]!.trim().length < 2) return { title: line, priceMinor: null }
  const amount = Number(match[2]!.replace(',', '.'))
  if (!Number.isFinite(amount) || amount <= 0) return { title: line, priceMinor: null }
  return { title: match[1]!.trim().replace(/[,—-]\s*$/, '').trim(), priceMinor: Math.round(amount * 100) }
}

const KIND_HINTS: Array<{ kind: AuthoringKind; re: RegExp }> = [
  { kind: 'digital', re: /\b(ebook|e-book|pdf|download|preset|template|course|digital|font|print(able)?|wallpaper|track|sample pack)\b/i },
  { kind: 'service', re: /\b(session|consult(ing|ation)?|clean(ing)?|coaching|lesson|class|massage|repair|design service|photoshoot|tutoring|appointment)\b/i },
]

/** Infer the fulfillment kind from the title (fallback: the business's onboarding leaning). */
export function inferKind(title: string, businessLeaning: AuthoringKind = 'physical'): AuthoringKind {
  for (const { kind, re } of KIND_HINTS) if (re.test(title)) return kind
  return businessLeaning
}

const CATEGORY_HINTS: Array<{ re: RegExp; path: string }> = [
  { re: /\b(blanket|scarf|beanie|knit|crochet|wool)\b/i, path: 'Home › Textiles' },
  { re: /\b(candle|soap|diffuser)\b/i, path: 'Home › Fragrance' },
  { re: /\b(ring|necklace|bracelet|earring)\b/i, path: 'Jewelry' },
  { re: /\b(mug|cup|plate|bowl|ceramic)\b/i, path: 'Home › Kitchen' },
  { re: /\b(shirt|tee|hoodie|dress|jacket)\b/i, path: 'Apparel' },
  { re: /\b(print|poster|art|painting)\b/i, path: 'Art' },
  { re: /\b(ebook|course|template|preset)\b/i, path: 'Digital' },
  { re: /\b(consult|session|coaching|lesson|clean)\b/i, path: 'Services' },
]

export function suggestCategory(title: string): string | null {
  for (const { re, path } of CATEGORY_HINTS) if (re.test(title)) return path
  return null
}

/** One warm, honest sentence — a draft, never applied without a tap. */
export function draftDescription(title: string, kind: AuthoringKind): string | null {
  const t = title.trim()
  if (t.length < 3) return null
  if (kind === 'digital') return `${t} — yours instantly after purchase.`
  if (kind === 'service') return `${t}, delivered personally with care.`
  return `${t}, made with care and ready to ship.`
}
