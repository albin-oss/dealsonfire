/**
 * Import sources (UI-COM-002 §4) — the adapter contract from ADR-005 §5.1 with a
 * capability matrix per source. CSV/Excel-as-CSV parse REAL files client-side today;
 * platform sources declare themselves honestly pending (their adapters arrive with
 * the import backend — no fake OAuth, no mock catalogs pretending to be yours).
 */
import type { IconName } from '@ds/index'

export interface ImportedProduct {
  title: string
  /** Integer minor units (money law) — null when the file had no usable price. */
  priceMinor: number | null
}

export interface ImportSource {
  id: string
  label: string
  icon: IconName
  kind: 'file' | 'platform'
  /** Honest availability: file parsing is real today; platforms await the backend. */
  available: boolean
  /** What the source can bring when available (the capability matrix). */
  brings: string[]
}

export const IMPORT_SOURCES: ImportSource[] = [
  { id: 'csv', label: 'CSV file', icon: 'upload', kind: 'file', available: true, brings: ['products', 'prices'] },
  { id: 'excel', label: 'Excel (save as CSV)', icon: 'upload', kind: 'file', available: true, brings: ['products', 'prices'] },
  { id: 'shopify', label: 'Shopify', icon: 'shopping-bag', kind: 'platform', available: false, brings: ['products', 'media', 'inventory'] },
  { id: 'woocommerce', label: 'WooCommerce', icon: 'shopping-cart', kind: 'platform', available: false, brings: ['products', 'media'] },
  { id: 'amazon', label: 'Amazon', icon: 'box', kind: 'platform', available: false, brings: ['products'] },
  { id: 'etsy', label: 'Etsy', icon: 'heart', kind: 'platform', available: false, brings: ['products', 'media', 'reviews (displayed, never blended)'] },
  { id: 'facebook', label: 'Facebook', icon: 'users', kind: 'platform', available: false, brings: ['products'] },
  { id: 'instagram', label: 'Instagram', icon: 'camera', kind: 'platform', available: false, brings: ['posts as product drafts'] },
  { id: 'square', label: 'Square', icon: 'store', kind: 'platform', available: false, brings: ['products', 'prices'] },
]

/** Minimal, forgiving CSV line parser (quotes + embedded commas/semicolons). */
function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++ }
      else if (ch === '"') quoted = false
      else current += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) { cells.push(current); current = '' }
    else current += ch
  }
  cells.push(current)
  return cells.map((c) => c.trim())
}

/**
 * Parse a product CSV: finds title/name and price columns by header (any casing;
 * semicolon or comma delimited). Prices become integer minor units (2-exponent
 * assumption for file imports — the reveal shows them for correction). Rows without
 * a title are skipped and counted, never guessed.
 */
export function parseProductsCsv(text: string): { products: ImportedProduct[]; skipped: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return { products: [], skipped: 0 }

  const delimiter = (lines[0]!.match(/;/g)?.length ?? 0) > (lines[0]!.match(/,/g)?.length ?? 0) ? ';' : ','
  const headers = parseCsvLine(lines[0]!, delimiter).map((h) => h.toLowerCase())
  const titleIdx = headers.findIndex((h) => ['title', 'name', 'product', 'product name', 'item'].includes(h))
  const priceIdx = headers.findIndex((h) => ['price', 'amount', 'unit price'].includes(h))
  if (titleIdx === -1) return { products: [], skipped: lines.length - 1 }

  const products: ImportedProduct[] = []
  let skipped = 0
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line, delimiter)
    const title = cells[titleIdx]?.trim() ?? ''
    if (title === '') { skipped++; continue }
    let priceMinor: number | null = null
    if (priceIdx !== -1) {
      const raw = (cells[priceIdx] ?? '').replace(/[^0-9.,]/g, '').replace(',', '.')
      const major = Number(raw)
      if (raw !== '' && Number.isFinite(major) && major >= 0) priceMinor = Math.round(major * 100)
    }
    products.push({ title: title.slice(0, 140), priceMinor })
  }
  return { products, skipped }
}
