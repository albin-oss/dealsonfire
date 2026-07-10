/**
 * R1-B1-VERTICAL-001 CSRF middleware unit test. Verifies the defense-in-depth
 * origin/same-site assertion: cross-site mutating requests are refused, same-site pass,
 * safe methods and dev mode are exempt. Drives the h3 handler with minimal mock events.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import csrf from '../../../server/middleware/02.csrf'
import * as config from '../../../server/utils/config'

function evt(method: string, path: string, headers: Record<string, string>) {
  return {
    method, path,
    node: { req: { headers } },
    // h3 getRequestHeader reads node.req.headers; getRequestHost reads host header
  } as unknown as Parameters<typeof csrf>[0]
}

const run = (e: ReturnType<typeof evt>) => (csrf as unknown as (event: typeof e) => unknown)(e)

beforeEach(() => {
  vi.spyOn(config, 'getServerConfig').mockReturnValue({
    databaseUrl: '', cronSecret: '', identityMode: 'session', isProduction: true,
    appBaseUrl: 'https://app.dof.dev', webauthnRpId: 'app.dof.dev', webauthnOrigin: 'https://app.dof.dev',
  })
})
afterEach(() => vi.restoreAllMocks())

describe('CSRF middleware (session mode)', () => {
  it('passes a same-origin mutating request', () => {
    expect(() => run(evt('POST', '/api/v1/auth/login', { origin: 'https://app.dof.dev', host: 'app.dof.dev' }))).not.toThrow()
  })

  it('refuses a cross-site mutating request', () => {
    expect(() => run(evt('POST', '/api/v1/auth/login', { origin: 'https://evil.example', host: 'app.dof.dev' })))
      .toThrow(/CSRF/)
  })

  it('refuses a mutating request with no Origin/Referer', () => {
    expect(() => run(evt('POST', '/api/v1/auth/login', { host: 'app.dof.dev' }))).toThrow(/CSRF/)
  })

  it('exempts safe methods and non-API paths', () => {
    expect(() => run(evt('GET', '/api/v1/auth/session', { host: 'app.dof.dev' }))).not.toThrow()
    expect(() => run(evt('POST', '/login', { origin: 'https://evil.example', host: 'app.dof.dev' }))).not.toThrow()
  })

  it('falls back to Referer host when Origin is absent', () => {
    expect(() => run(evt('POST', '/api/v1/auth/login', { referer: 'https://app.dof.dev/login', host: 'app.dof.dev' }))).not.toThrow()
    expect(() => run(evt('POST', '/api/v1/auth/login', { referer: 'https://evil.example/x', host: 'app.dof.dev' }))).toThrow(/CSRF/)
  })
})

describe('CSRF middleware (dev mode)', () => {
  it('is exempt entirely (header auth carries no ambient credential)', () => {
    vi.spyOn(config, 'getServerConfig').mockReturnValue({
      databaseUrl: '', cronSecret: '', identityMode: 'dev', isProduction: false,
      appBaseUrl: 'https://app.dof.dev', webauthnRpId: 'app.dof.dev', webauthnOrigin: 'https://app.dof.dev',
    })
    expect(() => run(evt('POST', '/api/v1/auth/login', { origin: 'https://evil.example', host: 'app.dof.dev' }))).not.toThrow()
  })
})
