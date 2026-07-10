/**
 * Catalog value objects (ADR-002 §2/§4.2, IMP-COM-001).
 * MediaReference, AIProvenance, and Money/Price are NOT redefined here — they are frozen
 * platform-wide contracts in the merchant shared-kernel (ADR-003 F5); commerce imports them.
 */
import { type Result, ok, err } from '../../../../shared/result'
import { type DomainError, domainError } from '../../../../shared/errors'

// ——— ProductTitle: 1–140 chars, no control characters, trimmed.
export type ProductTitle = string & { readonly __productTitle: true }

// eslint-disable-next-line no-control-regex -- rejecting control bytes is the point
const CONTROL_RE = /[\u0000-\u001F\u007F]/

export function createProductTitle(raw: string): Result<ProductTitle, DomainError> {
  const title = raw.trim()
  if (title.length === 0 || title.length > 140) {
    return err(domainError('VALIDATION_FAILED', 'product title must be 1–140 characters'))
  }
  if (CONTROL_RE.test(title)) {
    return err(domainError('VALIDATION_FAILED', 'product title must not contain control characters'))
  }
  return ok(title as ProductTitle)
}

// ——— ProductDescription: versioned rich document (ADR-004 rule 10 — version key inside jsonb docs).
export interface ProductDescription {
  readonly version: 1
  readonly format: 'plain' | 'markdown'
  readonly content: string
}

export const MAX_DESCRIPTION_LENGTH = 20_000

export function createProductDescription(input: { format?: 'plain' | 'markdown'; content: string }): Result<ProductDescription, DomainError> {
  const content = input.content.trim()
  if (content.length === 0 || content.length > MAX_DESCRIPTION_LENGTH) {
    return err(domainError('VALIDATION_FAILED', `product description must be 1–${MAX_DESCRIPTION_LENGTH} characters`))
  }
  return ok(Object.freeze({ version: 1 as const, format: input.format ?? 'plain', content }))
}

// ——— CategoryReference: OPAQUE validated string (BLUEPRINT-002 K3 / ADR-003 W2).
// Format-checked only; the Taxonomy domain owns semantics. Commerce must not invent a tree.
export type CategoryReference = string & { readonly __categoryRef: true }

const SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*'
const CATEGORY_RE = new RegExp(`^${SEGMENT}(?:/${SEGMENT}){0,5}$`)

export function createCategoryReference(raw: string): Result<CategoryReference, DomainError> {
  const ref = raw.trim().toLowerCase()
  if (ref.length > 200 || !CATEGORY_RE.test(ref)) {
    return err(domainError('VALIDATION_FAILED', 'category reference must be slash-separated kebab-case segments (max depth 6)'))
  }
  return ok(ref as CategoryReference)
}

// ——— ProductStatus: machine 1 of 3 (ADR-002 §0.3) — small on purpose.
// Publication is a LISTING concern; readiness is COMPUTED; this is merchant intent only.
export type ProductStatus = 'draft' | 'active' | 'archived'

export const PRODUCT_STATUS_TRANSITIONS: Record<ProductStatus, readonly ProductStatus[]> = {
  draft: ['active', 'archived'],
  active: ['archived'],
  archived: ['active'], // restore (ADR-002 §4.6: draft → active ⇄ archived)
}

export const canTransition = (from: ProductStatus, to: ProductStatus): boolean =>
  PRODUCT_STATUS_TRANSITIONS[from].includes(to)

// ——— FulfillmentKind: day-one column, schema-cheap now, rewrite-expensive later (ADR-001 §5.8-7).
export const FULFILLMENT_KINDS = ['physical', 'digital', 'service'] as const
export type FulfillmentKind = (typeof FULFILLMENT_KINDS)[number]
