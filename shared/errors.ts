/**
 * DomainError hierarchy with stable, contract-level error codes (BLUEPRINT-001 §4).
 * The HTTP mapping lives here so the contract (OpenAPI) and the server agree by construction.
 */
export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'CAPABILITY_MISSING'
  | 'STANDING_BLOCKED'
  | 'TRUST_LEVEL_REQUIRED'
  | 'STEP_UP_REQUIRED'
  | 'MERCHANT_INELIGIBLE'
  | 'TIER_LIMIT_REACHED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'HANDLE_TAKEN'
  | 'SKU_TAKEN'
  | 'LOCATION_HAS_STOCK'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_TOKEN'
  | 'INVALID_TRANSITION'
  | 'STORE_NOT_PUBLISHABLE'
  | 'ENFORCEMENT_HOLD'
  | 'VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INTERNAL'

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  AUTH_REQUIRED: 401,
  PERMISSION_DENIED: 403,
  CAPABILITY_MISSING: 403,
  STANDING_BLOCKED: 403,
  TRUST_LEVEL_REQUIRED: 403,
  STEP_UP_REQUIRED: 403,
  MERCHANT_INELIGIBLE: 403,
  TIER_LIMIT_REACHED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  HANDLE_TAKEN: 409,
  SKU_TAKEN: 409,
  LOCATION_HAS_STOCK: 409,
  EMAIL_TAKEN: 409,
  INVALID_CREDENTIALS: 401,
  INVALID_TOKEN: 400,
  INVALID_TRANSITION: 409,
  STORE_NOT_PUBLISHABLE: 409,
  ENFORCEMENT_HOLD: 423,
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  IDEMPOTENCY_CONFLICT: 409,
  INTERNAL: 500,
}

export class DomainError extends Error {
  readonly code: ErrorCode
  readonly details?: unknown

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.details = details
  }

  get httpStatus(): number {
    return ERROR_HTTP_STATUS[this.code]
  }
}

export const domainError = (code: ErrorCode, message: string, details?: unknown) =>
  new DomainError(code, message, details)

// ——— Error framework extensions (IMP-PLT-001) — additive; DomainError semantics unchanged.

/**
 * Codes a client may retry without changing the request. Everything else is either
 * caller error (fix the request) or a business fact (retrying won't help).
 */
export const RETRYABLE_CODES: ReadonlySet<ErrorCode> = new Set(['RATE_LIMITED', 'CONFLICT', 'INTERNAL'])

export const isRetryable = (error: unknown): boolean => {
  if (error instanceof InfrastructureError) return error.retryable
  if (error instanceof DomainError) return RETRYABLE_CODES.has(error.code)
  return false
}

/**
 * Infrastructure faults (DB down, provider timeout, pool exhausted) — distinct from
 * DomainError: they say nothing about the request's validity, only about the platform's
 * momentary health. They surface as INTERNAL problems and are retryable by default.
 */
export class InfrastructureError extends Error {
  readonly retryable: boolean

  constructor(message: string, options: { retryable?: boolean; cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = 'InfrastructureError'
    this.retryable = options.retryable ?? true
  }
}
