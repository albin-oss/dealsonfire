import { describe, it, expect } from 'vitest'
import { FixedClock, SystemClock } from '@platform/clock'
import { JsonConsoleLogger, redact, DEFAULT_REDACTED_KEYS } from '@platform/logger'
import { InMemoryMetrics } from '@platform/metrics'
import { pageRequest, encodeCursor, decodeCursor, buildPage, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from '@platform/pagination'
import { ConsumerRegistry } from '@platform/consumer-registry'
import { assertOwnedBy, sanitizeText, safeStringify } from '@platform/security'
import { intEnv, boolEnv, requireEnv, EnvFeatureFlags } from '@platform/config'
import { assertSqlIdentifier } from '@platform/types'
import { InfrastructureError, isRetryable, domainError } from '@shared/errors'

describe('Clock', () => {
  it('FixedClock is deterministic and advanceable; SystemClock tracks real time', () => {
    const clock = new FixedClock(new Date('2026-07-03T00:00:00Z'))
    expect(clock.epochMs()).toBe(Date.parse('2026-07-03T00:00:00Z'))
    clock.advance(60_000)
    expect(clock.now().toISOString()).toBe('2026-07-03T00:01:00.000Z')
    expect(Math.abs(new SystemClock().epochMs() - Date.now())).toBeLessThan(50)
  })
})

describe('Logger (redaction + correlation binding)', () => {
  it('redacts sensitive keys recursively and binds child fields', () => {
    const lines: string[] = []
    const logger = new JsonConsoleLogger({ write: (l) => lines.push(l) })
      .child({ correlation_id: 'corr-1' })
    logger.info('hello', { user_email: 'a@b.c', nested: { authorization: 'Bearer x', safe: 1 } })
    const parsed = JSON.parse(lines[0]!)
    expect(parsed.correlation_id).toBe('corr-1')
    expect(parsed.user_email).toBe('[redacted]')
    expect(parsed.nested.authorization).toBe('[redacted]')
    expect(parsed.nested.safe).toBe(1)
  })

  it('respects minLevel', () => {
    const lines: string[] = []
    const logger = new JsonConsoleLogger({ minLevel: 'warn', write: (l) => lines.push(l) })
    logger.info('nope')
    logger.warn('yes')
    expect(lines).toHaveLength(1)
  })

  it('redact() handles the default key set', () => {
    const out = redact({ password: 'x', ip: '1.2.3.4', fine: 'ok' }, DEFAULT_REDACTED_KEYS)
    expect(out).toEqual({ password: '[redacted]', ip: '[redacted]', fine: 'ok' })
  })

  it('REVIEW-002 H-2 regression: commerce fields are NOT redacted; real PII keys ARE (D-26)', () => {
    const out = redact({
      // The exact probe fixture that exposed substring matching:
      shipping_method: 'express',
      zip_code: '10115',
      description: 'wool socks',
      recipient_name: 'Rosa',
      membership_id: 'm1',
      // …while genuine sensitive keys still redact, across naming styles:
      ip_address: '1.2.3.4',
      userEmail: 'a@b.c',
      password_hash: 'x',
      authorization: 'Bearer y',
      api_token: 'z',
    }, DEFAULT_REDACTED_KEYS)
    expect(out).toEqual({
      shipping_method: 'express',
      zip_code: '10115',
      description: 'wool socks',
      recipient_name: 'Rosa',
      membership_id: 'm1',
      ip_address: '[redacted]',
      userEmail: '[redacted]',
      password_hash: '[redacted]',
      authorization: '[redacted]',
      api_token: '[redacted]',
    })
  })
})

describe('Metrics (in-memory)', () => {
  it('aggregates counters/observations/gauges with sorted tag keys', () => {
    const metrics = new InMemoryMetrics()
    metrics.increment('cmd', 1, { b: '2', a: '1' })
    metrics.increment('cmd', 2, { a: '1', b: '2' })
    metrics.observe('latency', 5)
    metrics.gauge('depth', 3)
    expect(metrics.counters.get('cmd{a=1,b=2}')).toBe(3)
    expect(metrics.observations.get('latency')).toEqual([5])
    expect(metrics.gauges.get('depth')).toBe(3)
  })
})

describe('Pagination', () => {
  it('clamps limits and rejects oversized cursors', () => {
    expect(pageRequest(undefined, undefined)).toEqual({ limit: DEFAULT_PAGE_SIZE, cursor: null })
    expect(pageRequest('9999', 'c').limit).toBe(MAX_PAGE_SIZE)
    expect(pageRequest(0, null).limit).toBe(1)
    expect(pageRequest(10, 'x'.repeat(600)).cursor).toBeNull()
  })

  it('cursor round-trips and rejects garbage', () => {
    const cursor = encodeCursor(['2026-07-03', 'id-1'])
    const decoded = decodeCursor(cursor)
    expect(decoded.ok && decoded.value).toEqual(['2026-07-03', 'id-1'])
    expect(decodeCursor('!!!not-base64json').ok).toBe(false)
    expect(decodeCursor(encodeCursor([]) /* empty tuple */).ok).toBe(false)
  })

  it('buildPage uses the limit+1 row as the has-next signal', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const page = buildPage(rows, 2, (r) => [r.id])
    expect(page.items.map((r) => r.id)).toEqual(['a', 'b'])
    expect(page.nextCursor).toBe(encodeCursor(['b']))
    expect(buildPage(rows, 3, (r) => [r.id]).nextCursor).toBeNull()
  })
})

describe('ConsumerRegistry', () => {
  const consumer = (name: string, types: string[]) => ({ consumer: name, eventTypes: types, handle: async () => {} })

  it('rejects duplicates and empty subscriptions; indexes by event type', () => {
    const registry = new ConsumerRegistry()
    registry.register(consumer('a', ['x.y']))
    expect(() => registry.register(consumer('a', ['z']))).toThrow(/already registered/)
    expect(() => registry.register(consumer('b', []))).toThrow(/no event types/)
    registry.register(consumer('c', ['x.y', 'q.r']))
    expect(registry.forEventType('x.y').map((c) => c.consumer)).toEqual(['a', 'c'])
    expect(registry.subscribedEventTypes()).toEqual(['q.r', 'x.y'])
  })
})

describe('Security utilities (semantic-free — C-1)', () => {
  it('assertOwnedBy masks cross-tenant access as NOT_FOUND', () => {
    const denied = assertOwnedBy({ businessId: 'b1' }, 'b2', 'product')
    expect(!denied.ok && denied.error.code).toBe('NOT_FOUND')
    expect(assertOwnedBy({ businessId: 'b1' }, 'b1', 'product').ok).toBe(true)
    expect(assertOwnedBy(null, 'b1', 'product').ok).toBe(false)
  })

  it('sanitizeText strips control chars, keeps newlines, caps length', () => {
    expect(sanitizeText('  a\u0001bc\nd  ', 100)).toBe('abc\nd')
    expect(sanitizeText('x'.repeat(50), 10)).toHaveLength(10)
  })

  it('safeStringify survives circulars and BigInt and truncates', () => {
    const circular: Record<string, unknown> = { n: 1n }
    circular.self = circular
    const out = safeStringify(circular)
    expect(out).toContain('"n":"1"')
    expect(out).toContain('[circular]')
    expect(safeStringify({ big: 'y'.repeat(20_000) })).toContain('…[truncated]')
  })
})

describe('Config', () => {
  it('typed env readers validate and default', () => {
    process.env.DOF_TEST_INT = '5'
    process.env.DOF_TEST_BOOL = 'yes'
    expect(intEnv('DOF_TEST_INT', 1)).toBe(5)
    expect(intEnv('DOF_TEST_MISSING', 7)).toBe(7)
    expect(boolEnv('DOF_TEST_BOOL', false)).toBe(true)
    process.env.DOF_TEST_INT = 'nope'
    expect(() => intEnv('DOF_TEST_INT', 1)).toThrow(/integer/)
    expect(() => requireEnv('DOF_TEST_ABSENT')).toThrow(/required/)
    delete process.env.DOF_TEST_INT
    delete process.env.DOF_TEST_BOOL
  })

  it('feature flags read DOF_FLAG_* and reject bad names', () => {
    const flags = new EnvFeatureFlags()
    process.env.DOF_FLAG_TEST_SPRINT = 'true'
    expect(flags.isEnabled('test_sprint')).toBe(true)
    expect(flags.isEnabled('test_absent')).toBe(false)
    expect(() => flags.isEnabled('bad name')).toThrow(/invalid flag/)
    delete process.env.DOF_FLAG_TEST_SPRINT
  })
})

describe('Error framework extensions', () => {
  it('classifies retryability', () => {
    expect(isRetryable(domainError('RATE_LIMITED', 'x'))).toBe(true)
    expect(isRetryable(domainError('VALIDATION_FAILED', 'x'))).toBe(false)
    expect(isRetryable(new InfrastructureError('db down'))).toBe(true)
    expect(isRetryable(new InfrastructureError('poison', { retryable: false }))).toBe(false)
    expect(isRetryable(new Error('plain'))).toBe(false)
  })
})

describe('SQL identifier guard', () => {
  it('accepts snake_case, rejects injection-shaped names', () => {
    expect(assertSqlIdentifier('outbox_events')).toBe('outbox_events')
    expect(() => assertSqlIdentifier('x; DROP TABLE y')).toThrow(/invalid SQL identifier/)
    expect(() => assertSqlIdentifier('1starts_with_digit')).toThrow()
  })
})
