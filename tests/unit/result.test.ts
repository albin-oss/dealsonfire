/**
 * Shared Result combinators (PROMPT-006). Pure, framework-independent. Covers success +
 * failure paths, short-circuiting, async, collection, and Promise adaptation.
 */
import { describe, it, expect } from 'vitest'
import {
  ok, err, isOk, isErr, unwrap, unwrapOr, map, mapErr, andThen, flatMap,
  mapAsync, andThenAsync, combine, fromPromise, type Result,
} from '../../shared/result'

const boom = { code: 'BOOM', message: 'boom' }

describe('Result combinators', () => {
  it('guards narrow correctly', () => {
    expect(isOk(ok(1))).toBe(true)
    expect(isErr(err(boom))).toBe(true)
    expect(isOk(err(boom))).toBe(false)
  })

  it('map transforms success, passes failure through', () => {
    expect(map(ok(2), (n) => n * 3)).toEqual({ ok: true, value: 6 })
    expect(map(err(boom) as Result<number, typeof boom>, (n) => n * 3)).toEqual({ ok: false, error: boom })
  })

  it('mapErr transforms error, passes success through', () => {
    expect(mapErr(err(boom), (e) => e.code)).toEqual({ ok: false, error: 'BOOM' })
    expect(mapErr(ok(1) as Result<number, typeof boom>, (e) => e.code)).toEqual({ ok: true, value: 1 })
  })

  it('andThen/flatMap chains and short-circuits on first failure', () => {
    const half = (n: number): Result<number, typeof boom> => (n % 2 === 0 ? ok(n / 2) : err(boom))
    expect(andThen(ok(8), half)).toEqual({ ok: true, value: 4 })
    expect(andThen(ok(7), half)).toEqual({ ok: false, error: boom })
    expect(flatMap(err(boom) as Result<number, typeof boom>, half)).toEqual({ ok: false, error: boom })
  })

  it('unwrapOr returns the fallback on failure only', () => {
    expect(unwrapOr(ok(5), 0)).toBe(5)
    expect(unwrapOr(err(boom) as Result<number, typeof boom>, 0)).toBe(0)
  })

  it('unwrap throws on error (programming-error contexts)', () => {
    expect(() => unwrap(err(boom))).toThrow(/unwrap/)
  })

  it('mapAsync / andThenAsync work and short-circuit', async () => {
    expect(await mapAsync(ok(2), async (n) => n + 1)).toEqual({ ok: true, value: 3 })
    expect(await mapAsync(err(boom) as Result<number, typeof boom>, async (n) => n + 1)).toEqual({ ok: false, error: boom })
    const load = async (n: number): Promise<Result<string, typeof boom>> => (n > 0 ? ok(`#${n}`) : err(boom))
    expect(await andThenAsync(ok(3), load)).toEqual({ ok: true, value: '#3' })
    expect(await andThenAsync(err(boom) as Result<number, typeof boom>, load)).toEqual({ ok: false, error: boom })
  })

  it('combine collects successes; first failure wins', () => {
    expect(combine([ok(1), ok(2), ok(3)])).toEqual({ ok: true, value: [1, 2, 3] })
    expect(combine([ok(1), err(boom), ok(3)])).toEqual({ ok: false, error: boom })
    expect(combine([] as Result<number, typeof boom>[])).toEqual({ ok: true, value: [] })
  })

  it('fromPromise adapts resolve and reject', async () => {
    expect(await fromPromise(Promise.resolve(9), () => boom)).toEqual({ ok: true, value: 9 })
    expect(await fromPromise(Promise.reject(new Error('x')), (e) => (e as Error).message)).toEqual({ ok: false, error: 'x' })
  })

  it('serializes as a plain discriminated union (structuredClone-safe)', () => {
    const r = ok({ a: 1 })
    expect(JSON.parse(JSON.stringify(r))).toEqual({ ok: true, value: { a: 1 } })
    expect(structuredClone(err(boom))).toEqual({ ok: false, error: boom })
  })
})
