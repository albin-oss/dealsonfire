/**
 * HandleService (ADR-001 §5.3): validation, derivation, claim, and deterministic
 * suggestion. DERIVED handles never surface HANDLE_TAKEN (DECISIONS D-16): non-Latin,
 * emoji, too-short, and reserved-colliding names fall back to `store-<random>`; only
 * merchant-CHOSEN handles fail loudly. Reservation-with-TTL (Ignite step 2) arrives with
 * Module 3 on the same ledger.
 */
import { randomBytes } from 'node:crypto'
import { type Result, ok, err } from '../../../../shared/result'
import { type DomainError, domainError } from '../../../../shared/errors'
import { createHandle, type Handle } from '../../shared-kernel/handle'
import type { StoreId } from '../../shared-kernel/ids'
import type { Tx, HandleLedger } from '../domain/ports'

function randomSuffix(length: number): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789' // no ambiguous chars
  const bytes = randomBytes(length)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export class HandleService {
  constructor(private readonly ledger: HandleLedger) {}

  /**
   * Derive a valid, unreserved handle candidate from a display name
   * ("Rosa's Knits!" → "rosas-knits"). ALWAYS returns a valid handle: names that slugify
   * to nothing (CJK, Arabic, emoji) or collide with reserved words (e.g. "Store") fall
   * back to `store-<random>` (REVIEW-001 H-3 — the Grandma Test does not speak ASCII).
   */
  deriveFromName(name: string): Handle {
    const slug = name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics after NFKD
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 30)
      .replace(/-+$/g, '')

    for (const candidate of [slug, `store-${slug}`.slice(0, 30).replace(/-+$/g, '')]) {
      const validated = createHandle(candidate)
      if (validated.ok) return validated.value
    }
    const fallback = createHandle(`store-${randomSuffix(6)}`)
    if (!fallback.ok) throw new Error('unreachable: random fallback handle failed validation')
    return fallback.value
  }

  /**
   * Claim `preferred` for the store. Derived handles (allowFallback) walk numbered variants
   * then random suffixes — they never return HANDLE_TAKEN. Explicit handles fail with
   * suggestions the caller can surface.
   */
  async claimWithFallback(tx: Tx, preferred: string, storeId: StoreId, allowFallback: boolean): Promise<Result<Handle, DomainError>> {
    const validated = createHandle(preferred)
    if (!validated.ok) {
      if (!allowFallback) return validated
      // Derived candidate turned invalid/reserved (defense in depth on top of deriveFromName)
      return this.claimWithFallback(tx, `store-${randomSuffix(6)}`, storeId, true)
    }
    if (await this.ledger.claim(tx, validated.value, storeId)) return ok(validated.value)
    if (allowFallback) {
      for (let n = 2; n <= 9; n++) {
        const candidate = createHandle(`${validated.value.slice(0, 27)}-${n}`)
        if (candidate.ok && (await this.ledger.claim(tx, candidate.value, storeId))) return ok(candidate.value)
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        const candidate = createHandle(`${validated.value.slice(0, 23)}-${randomSuffix(4)}`)
        if (candidate.ok && (await this.ledger.claim(tx, candidate.value, storeId))) return ok(candidate.value)
      }
    }
    return err(domainError('HANDLE_TAKEN', `handle "${validated.value}" is taken`, {
      suggestions: [2, 3, 4].map((n) => `${validated.value.slice(0, 27)}-${n}`),
    }))
  }
}
