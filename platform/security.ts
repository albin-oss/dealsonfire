/**
 * Semantic-free security utilities (IMP-PLT-001). DELIBERATELY EXCLUDED: permission and
 * capability helpers — those are the Merchant domain's authorization kernel per ADR-003 §3
 * and frozen interfaces F2/F7 (documented conflict C-1 of this sprint). What lives here
 * carries no authorization semantics: tenancy masking, input sanitization, log-safe
 * serialization.
 */
import { type Result, ok, err } from '../shared/result'
import { type DomainError, domainError } from '../shared/errors'

/**
 * Ownership validation with existence masking (the kernel's 404 rule, platform-wide):
 * a resource owned by another tenant answers NOT_FOUND, never PERMISSION_DENIED —
 * existence itself is information.
 */
export function assertOwnedBy(
  resource: { businessId: string } | null | undefined,
  requesterBusinessId: string,
  resourceLabel: string,
): Result<void, DomainError> {
  if (!resource || resource.businessId !== requesterBusinessId) {
    return err(domainError('NOT_FOUND', `${resourceLabel} not found`))
  }
  return ok(undefined)
}

/**
 * Input sanitization for free-text fields: strips control characters (keeps \n\t),
 * normalizes unicode, collapses leading/trailing whitespace, enforces a length cap.
 * Validation (zod) checks SHAPE; this removes the bytes that shape checks let through.
 */
export function sanitizeText(input: string, maxLength: number): string {
  return input
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- stripping control bytes is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength)
}

/** Circular-safe, BigInt-safe stringification for logs/diagnostics — never throws. */
export function safeStringify(value: unknown, maxLength = 10_000): string {
  const seen = new WeakSet<object>()
  let out: string
  try {
    out = JSON.stringify(value, (_key, v: unknown) => {
      if (typeof v === 'bigint') return v.toString()
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[circular]'
        seen.add(v)
      }
      return v
    }) ?? 'undefined'
  } catch (error) {
    out = `[unserializable: ${(error as Error).message}]`
  }
  return out.length > maxLength ? out.slice(0, maxLength) + '…[truncated]' : out
}
