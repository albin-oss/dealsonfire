/**
 * Command endpoint wrapper (BLUEPRINT §1): validate → rate-limit → idempotency →
 * handle (which runs the triple gate + audit inside its transaction) → problem+json.
 * Denied SENSITIVE commands are audited here (DECISIONS D-10). No business logic lives here.
 */
import type { H3Event, EventHandler } from 'h3'
import { defineEventHandler, readBody, getHeader, setResponseStatus } from 'h3'
import type { ZodType } from 'zod'
import type { Result } from '@shared/result'
import { DomainError, domainError } from '@shared/errors'
import { uuidv7, isUuid } from '@domains/merchant/shared-kernel/uuid'
import { sendProblem, internalProblem } from './problem'
import { resolveAuth, type AuthContext } from './identity'
import { getContainer } from './container'
import { GLOBAL_RATE_LIMIT } from './rate-limit'

export interface CommandEndpointOptions<TBody, TOut> {
  command: string
  schema: ZodType<TBody>
  successStatus?: number
  sensitivity?: 'normal' | 'sensitive'
  rateLimit?: { limit: number; windowSeconds: number }
  handler(ctx: {
    event: H3Event
    body: TBody
    auth: AuthContext
    requestContext: Record<string, unknown>
  }): Promise<Result<TOut, DomainError>>
}

export function defineCommandEndpoint<TBody, TOut>(options: CommandEndpointOptions<TBody, TOut>): EventHandler {
  return defineEventHandler(async (event) => {
    const requestId = getHeader(event, 'x-request-id')
    // correlation_id is a uuid column (ADR-004 C1): non-UUID client values are replaced,
    // never trusted into the envelope.
    const correlationId = requestId && isUuid(requestId) ? requestId : uuidv7()
    const container = getContainer()

    const auth = (event.context.auth as AuthContext | null | undefined) ?? resolveAuth(event)
    if (!auth) return sendProblem(event, domainError('AUTH_REQUIRED', 'authentication required'), correlationId)

    if (!container.rateLimiter.allow(`global:${auth.userId}`, GLOBAL_RATE_LIMIT.limit, GLOBAL_RATE_LIMIT.windowSeconds)) {
      return sendProblem(event, domainError('RATE_LIMITED', 'too many requests'), correlationId)
    }
    if (options.rateLimit) {
      const key = `${options.command}:${auth.userId}`
      if (!container.rateLimiter.allow(key, options.rateLimit.limit, options.rateLimit.windowSeconds)) {
        return sendProblem(event, domainError('RATE_LIMITED', 'too many requests'), correlationId)
      }
    }

    const raw = await readBody(event).catch(() => undefined)
    const parsed = options.schema.safeParse(raw ?? {})
    if (!parsed.success) {
      return sendProblem(
        event,
        domainError('VALIDATION_FAILED', 'request body failed validation', {
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        }),
        correlationId,
      )
    }

    const requestContext: Record<string, unknown> = {
      correlation_id: correlationId,
      ip: getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim() ?? event.node?.req.socket?.remoteAddress ?? null,
      user_agent: getHeader(event, 'user-agent') ?? null,
      step_up_verified: auth.stepUpVerified,
    }

    // Idempotency-Key support (BLUEPRINT §4, DECISIONS D-01)
    const idempotencyKey = getHeader(event, 'idempotency-key')
    const endpointKey = options.command
    const actorKey = auth.userId
    if (idempotencyKey) {
      const check = await container.idempotency.begin(
        idempotencyKey, endpointKey, actorKey, container.idempotency.hash(parsed.data),
      )
      if (check.kind === 'conflict') {
        return sendProblem(event, domainError('IDEMPOTENCY_CONFLICT', 'Idempotency-Key was used with a different request body'), correlationId)
      }
      if (check.kind === 'in_flight') {
        return sendProblem(event, domainError('CONFLICT', 'a request with this Idempotency-Key is still in flight'), correlationId)
      }
      if (check.kind === 'replay') {
        setResponseStatus(event, check.status)
        return check.body
      }
    }

    try {
      const result = await options.handler({ event, body: parsed.data, auth, requestContext })

      if (!result.ok) {
        if (options.sensitivity === 'sensitive') {
          await container.audit.recordDenied({
            businessId: null,
            actor: { type: 'user', id: auth.userId },
            command: options.command,
            sensitivity: 'sensitive',
            target: {},
            context: requestContext,
            denialCode: result.error.code,
          }).catch(() => {})
        }
        if (idempotencyKey) await container.idempotency.release(idempotencyKey, endpointKey, actorKey).catch(() => {})
        return sendProblem(event, result.error, correlationId)
      }

      const status = options.successStatus ?? 200
      if (idempotencyKey) {
        await container.idempotency.complete(idempotencyKey, endpointKey, actorKey, status, result.value).catch(() => {})
      }
      setResponseStatus(event, status)
      return result.value
    } catch (error) {
      if (idempotencyKey) await container.idempotency.release(idempotencyKey, endpointKey, actorKey).catch(() => {})
      if (error instanceof DomainError) {
        // Infrastructure translated a constraint into a domain answer (e.g. SKU_TAKEN, D-31)
        return sendProblem(event, error, correlationId)
      }
      console.error(`[${options.command}] ${correlationId}:`, error)
      return internalProblem(event, correlationId)
    }
  })
}

export function defineQueryEndpoint<TOut>(options: {
  handler(ctx: { event: H3Event; auth: AuthContext }): Promise<TOut>
}): EventHandler {
  return defineEventHandler(async (event) => {
    const requestId = getHeader(event, 'x-request-id')
    // correlation_id is a uuid column (ADR-004 C1): non-UUID client values are replaced,
    // never trusted into the envelope.
    const correlationId = requestId && isUuid(requestId) ? requestId : uuidv7()
    const auth = (event.context.auth as AuthContext | null | undefined) ?? resolveAuth(event)
    if (!auth) return sendProblem(event, domainError('AUTH_REQUIRED', 'authentication required'), correlationId)
    if (!getContainer().rateLimiter.allow(`global:${auth.userId}`, GLOBAL_RATE_LIMIT.limit, GLOBAL_RATE_LIMIT.windowSeconds)) {
      return sendProblem(event, domainError('RATE_LIMITED', 'too many requests'), correlationId)
    }
    try {
      return await options.handler({ event, auth })
    } catch (error) {
      console.error(`[query] ${correlationId}:`, error)
      return internalProblem(event, correlationId)
    }
  })
}
