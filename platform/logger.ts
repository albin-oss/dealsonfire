/**
 * Structured logging port (IMP-PLT-001 observability). One-line JSON to stdout — the
 * correct shape for Vercel/any log drain. Correlation ids bind via child(); configured
 * keys are redacted so PII never reaches logs (ADR-004 rule 19).
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogFields = Record<string, unknown>

export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  /** New logger with bound fields (correlation_id, domain, consumer …) on every line. */
  child(fields: LogFields): Logger
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

/** Default redaction set — extend per instance, never shrink below this. */
export const DEFAULT_REDACTED_KEYS = ['password', 'secret', 'token', 'authorization', 'cookie', 'ip', 'email'] as const

/**
 * Token-based key matching (REVIEW-002 H-2, D-26). Substring matching redacted
 * `shipping_method`, `description`, `membership_id` (the `ip` substring) — destroying the
 * observability redaction exists to protect. Rules: a key is redacted when any of its
 * tokens (split on delimiters + camelCase) EQUALS a redacted key, or — for long redacted
 * keys only (≥ 6 chars, e.g. `password`) — when a token merely contains it.
 */
function tokensOf(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
}

export function shouldRedactKey(key: string, redactedKeys: readonly string[]): boolean {
  const tokens = tokensOf(key)
  return redactedKeys.some((r) =>
    tokens.some((t) => t === r || (r.length >= 6 && t.includes(r))),
  )
}

export function redact(fields: LogFields, redactedKeys: readonly string[]): LogFields {
  const out: LogFields = {}
  for (const [key, value] of Object.entries(fields)) {
    if (shouldRedactKey(key, redactedKeys)) {
      out[key] = '[redacted]'
    } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      out[key] = redact(value as LogFields, redactedKeys)
    } else {
      out[key] = value
    }
  }
  return out
}

export class JsonConsoleLogger implements Logger {
  constructor(
    private readonly options: {
      minLevel?: LogLevel
      redactedKeys?: readonly string[]
      bound?: LogFields
      /** Injectable sink for tests; defaults to console. */
      write?: (line: string) => void
    } = {},
  ) {}

  private log(level: LogLevel, message: string, fields?: LogFields): void {
    const minLevel = this.options.minLevel ?? 'info'
    if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return
    const redactedKeys = this.options.redactedKeys ?? DEFAULT_REDACTED_KEYS
    const line = JSON.stringify({
      level,
      time: new Date().toISOString(),
      message,
      ...redact({ ...(this.options.bound ?? {}), ...(fields ?? {}) }, redactedKeys),
    })
    const write = this.options.write ?? ((l: string) => (level === 'error' ? console.error(l) : console.log(l)))
    write(line)
  }

  debug(message: string, fields?: LogFields): void { this.log('debug', message, fields) }
  info(message: string, fields?: LogFields): void { this.log('info', message, fields) }
  warn(message: string, fields?: LogFields): void { this.log('warn', message, fields) }
  error(message: string, fields?: LogFields): void { this.log('error', message, fields) }

  child(fields: LogFields): Logger {
    return new JsonConsoleLogger({ ...this.options, bound: { ...(this.options.bound ?? {}), ...fields } })
  }
}

export class NoopLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  child(): Logger { return this }
}
