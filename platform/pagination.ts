/**
 * Cursor pagination utilities (IMP-PLT-001 query helpers). Cursors are opaque base64url
 * tokens over the sort-key tuple — clients never see or construct raw keys; offset
 * pagination is deliberately absent (unusable at 100M rows, ADR-004 rule 22).
 */
import { type Result, ok, err } from '../shared/result'
import { type DomainError, domainError } from '../shared/errors'

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

export interface PageRequest {
  limit: number
  cursor: string | null
}

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

/** Clamp raw client input into a safe PageRequest. */
export function pageRequest(rawLimit?: unknown, rawCursor?: unknown): PageRequest {
  const parsed = typeof rawLimit === 'string' ? Number(rawLimit) : typeof rawLimit === 'number' ? rawLimit : NaN
  const limit = Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE
  const cursor = typeof rawCursor === 'string' && rawCursor.length > 0 && rawCursor.length <= 512 ? rawCursor : null
  return { limit, cursor }
}

export function encodeCursor(sortKey: readonly (string | number)[]): string {
  return Buffer.from(JSON.stringify(sortKey), 'utf8').toString('base64url')
}

export function decodeCursor(cursor: string): Result<(string | number)[], DomainError> {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (!Array.isArray(decoded) || decoded.length === 0 || decoded.length > 4 ||
        !decoded.every((v) => typeof v === 'string' || typeof v === 'number')) {
      return err(domainError('VALIDATION_FAILED', 'invalid pagination cursor'))
    }
    return ok(decoded as (string | number)[])
  } catch {
    return err(domainError('VALIDATION_FAILED', 'invalid pagination cursor'))
  }
}

/**
 * Build a Page from limit+1 fetched rows: the presence of the extra row IS the
 * has-next signal; its sort key becomes the cursor.
 */
export function buildPage<T>(rows: T[], limit: number, sortKeyOf: (row: T) => readonly (string | number)[]): Page<T> {
  if (rows.length <= limit) return { items: rows, nextCursor: null }
  const items = rows.slice(0, limit)
  const last = items[items.length - 1]
  return { items, nextCursor: last === undefined ? null : encodeCursor(sortKeyOf(last)) }
}
