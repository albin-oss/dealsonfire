/**
 * Public endpoint wrapper (WP-R1-B1): the auth surface that must work BEFORE a session
 * exists (register/login/recovery). Same discipline as the command wrapper — zod
 * validation, RFC 9457 problems, IP-keyed rate limiting, correlation — minus the auth
 * gate. Handlers return a Result; the wrapper renders it. Cookie side-effects happen in
 * the handler via h3 helpers (it receives the raw event).
 */
import type { H3Event, EventHandler } from 'h3'
import { defineEventHandler, readBody, getHeader, getRequestIP, setResponseStatus } from 'h3'
import type { ZodType } from 'zod'
import type { Result } from '@shared/result'
import { type DomainError, domainError } from '@shared/errors'
import { uuidv7, isUuid } from '@domains/merchant/shared-kernel/uuid'
import { sendProblem, internalProblem } from './problem'
import { getContainer } from './container'

export interface PublicEndpointOptions<TBody, TOut> {
  name: string
  schema: ZodType<TBody>
  successStatus?: number
  /** IP-keyed rate limit (auth endpoints throttle by source, not by user). */
  rateLimit?: { limit: number; windowSeconds: number }
  handler(ctx: { event: H3Event; body: TBody; correlationId: string }): Promise<Result<TOut, DomainError>>
}

export function definePublicEndpoint<TBody, TOut>(options: PublicEndpointOptions<TBody, TOut>): EventHandler {
  return defineEventHandler(async (event) => {
    const requestId = getHeader(event, 'x-request-id')
    const correlationId = requestId && isUuid(requestId) ? requestId : uuidv7()

    // The whole pipeline is guarded: an unexpected throw anywhere — including a
    // misconfigured container (e.g. NUXT_DATABASE_URL absent) — must render as an
    // RFC 9457 problem, never leak a stack trace on the public auth surface.
    try {
      const container = getContainer()

      if (options.rateLimit) {
        const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
        const key = `${options.name}:${ip}`
        if (!container.rateLimiter.allow(key, options.rateLimit.limit, options.rateLimit.windowSeconds)) {
          return sendProblem(event, domainError('RATE_LIMITED', 'too many attempts — wait a moment and try again'), correlationId)
        }
      }

      const raw = await readBody(event).catch(() => undefined)
      const parsed = options.schema.safeParse(raw ?? {})
      if (!parsed.success) {
        return sendProblem(event, domainError('VALIDATION_FAILED', 'request failed validation', {
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        }), correlationId)
      }

      const result = await options.handler({ event, body: parsed.data, correlationId })
      if (!result.ok) return sendProblem(event, result.error, correlationId)
      setResponseStatus(event, options.successStatus ?? 200)
      return result.value
    } catch (error) {
      console.error(`[${options.name}] ${correlationId}:`, error)
      return internalProblem(event, correlationId)
    }
  })
}
