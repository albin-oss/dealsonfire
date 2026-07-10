/**
 * Result<T, E> — the domain layer never throws for business-rule failures (BLUEPRINT-001 §1).
 * Exceptions are reserved for infrastructure faults.
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

/** Unwrap for contexts where failure is a programming error (e.g. trusted factories in tests). */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw new Error(`unwrap() on error result: ${JSON.stringify(result.error)}`)
  return result.value
}
