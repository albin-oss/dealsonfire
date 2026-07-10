import { describe, it, expect, afterEach, vi } from 'vitest'
import { MemoryRateLimiter } from '../../server/utils/rate-limit'
import { resolveAuth } from '../../server/utils/identity'
import { uuidv7 } from '@domains/merchant/shared-kernel/uuid'
import type { H3Event } from 'h3'

describe('MemoryRateLimiter (REVIEW-001 L-1)', () => {
  afterEach(() => vi.useRealTimers())

  it('enforces the sliding window and recovers after it passes', () => {
    vi.useFakeTimers()
    const limiter = new MemoryRateLimiter()
    expect(limiter.allow('k', 2, 60)).toBe(true)
    expect(limiter.allow('k', 2, 60)).toBe(true)
    expect(limiter.allow('k', 2, 60)).toBe(false)
    vi.advanceTimersByTime(61_000)
    expect(limiter.allow('k', 2, 60)).toBe(true)
  })

  it('keys are independent (no global reset behavior)', () => {
    const limiter = new MemoryRateLimiter()
    expect(limiter.allow('a', 1, 60)).toBe(true)
    expect(limiter.allow('a', 1, 60)).toBe(false)
    expect(limiter.allow('b', 1, 60)).toBe(true) // unaffected by a's exhaustion
  })
})

describe('identity dev adapter fails closed in production (D-04, REVIEW-001 L-7)', () => {
  const fakeEvent = (headers: Record<string, string>): H3Event =>
    ({ node: { req: { headers } } }) as unknown as H3Event

  const originalEnv = { NODE_ENV: process.env.NODE_ENV, MODE: process.env.NUXT_IDENTITY_MODE }
  afterEach(() => {
    process.env.NODE_ENV = originalEnv.NODE_ENV
    if (originalEnv.MODE === undefined) delete process.env.NUXT_IDENTITY_MODE
    else process.env.NUXT_IDENTITY_MODE = originalEnv.MODE
  })

  it('accepts the header in non-production dev mode', () => {
    process.env.NUXT_IDENTITY_MODE = 'dev'
    const userId = uuidv7()
    const auth = resolveAuth(fakeEvent({ 'x-dof-user-id': userId, 'x-dof-step-up': 'true' }))
    expect(auth).toEqual({ userId, stepUpVerified: true })
  })

  it('REFUSES dev-mode auth when NODE_ENV=production', () => {
    process.env.NUXT_IDENTITY_MODE = 'dev'
    process.env.NODE_ENV = 'production'
    expect(resolveAuth(fakeEvent({ 'x-dof-user-id': uuidv7() }))).toBeNull()
  })

  it('session mode fails closed until Identity lands', () => {
    process.env.NUXT_IDENTITY_MODE = 'session'
    expect(resolveAuth(fakeEvent({ 'x-dof-user-id': uuidv7() }))).toBeNull()
  })

  it('rejects non-UUID user ids', () => {
    process.env.NUXT_IDENTITY_MODE = 'dev'
    expect(resolveAuth(fakeEvent({ 'x-dof-user-id': 'admin' }))).toBeNull()
  })
})
