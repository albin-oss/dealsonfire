/**
 * RFC 9457 problem+json responses with stable codes (BLUEPRINT §4).
 * Unexpected exceptions become INTERNAL with a correlation id and no leaked internals.
 */
import type { H3Event } from 'h3'
import { setResponseStatus, setResponseHeader } from 'h3'
import { type DomainError } from '@shared/errors'

export interface ProblemBody {
  type: string
  title: string
  status: number
  detail?: string
  code: string
  details?: unknown
  correlation_id?: string
}

export function problemFromDomainError(error: DomainError): ProblemBody {
  return {
    type: 'https://docs.dof.dev/problems/' + error.code.toLowerCase().replace(/_/g, '-'),
    title: error.code,
    status: error.httpStatus,
    detail: error.message,
    code: error.code,
    ...(error.details !== undefined ? { details: error.details } : {}),
  }
}

export function sendProblem(event: H3Event, error: DomainError, correlationId?: string): ProblemBody {
  const body = problemFromDomainError(error)
  if (correlationId) body.correlation_id = correlationId
  setResponseStatus(event, body.status)
  setResponseHeader(event, 'content-type', 'application/problem+json')
  return body
}

export function internalProblem(event: H3Event, correlationId: string): ProblemBody {
  const body: ProblemBody = {
    type: 'https://docs.dof.dev/problems/internal',
    title: 'INTERNAL',
    status: 500,
    detail: 'An unexpected error occurred.',
    code: 'INTERNAL',
    correlation_id: correlationId,
  }
  setResponseStatus(event, 500)
  setResponseHeader(event, 'content-type', 'application/problem+json')
  return body
}
