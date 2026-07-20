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

// ————————————————————————————————————————————— combinators
// Purely additive over the discriminated union above — existing `if (!r.ok)` code is
// unaffected. Framework-independent; no throwing on the failure path.

/** Narrowing guards. */
export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok
export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } => !r.ok

/** Value default on failure. */
export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback
}

/** Transform the success value; a failure passes through untouched. */
export function map<T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r
}

/** Transform the error; a success passes through untouched. */
export function mapErr<T, E, F>(r: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return r.ok ? r : err(fn(r.error))
}

/** Chain a Result-returning step (a.k.a. flatMap); short-circuits on the first failure. */
export function andThen<T, U, E>(r: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return r.ok ? fn(r.value) : r
}
export { andThen as flatMap }

/** Async transform of the success value. */
export async function mapAsync<T, U, E>(r: Result<T, E>, fn: (value: T) => Promise<U>): Promise<Result<U, E>> {
  return r.ok ? ok(await fn(r.value)) : r
}

/** Async chain of a Result-returning step; short-circuits on the first failure. */
export async function andThenAsync<T, U, E>(r: Result<T, E>, fn: (value: T) => Promise<Result<U, E>>): Promise<Result<U, E>> {
  return r.ok ? fn(r.value) : r
}

/** Collect an array of Results into a Result of an array; the first failure wins. */
export function combine<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = []
  for (const r of results) {
    if (!r.ok) return r
    values.push(r.value)
  }
  return ok(values)
}

/** Adapt a throwing Promise into a Result, mapping the thrown error through `onError`. */
export async function fromPromise<T, E>(promise: Promise<T>, onError: (e: unknown) => E): Promise<Result<T, E>> {
  try {
    return ok(await promise)
  } catch (e) {
    return err(onError(e))
  }
}
