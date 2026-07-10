/**
 * Health/readiness checks (IMP-PLT-001 observability). Named checks with timeouts;
 * the endpoint reports ok/degraded and never leaks internals (check names + booleans +
 * latency only). Liveness = the process answers; readiness = registered checks pass.
 */
import type pg from 'pg'
import type { ProjectionRegistry } from './projection-registry'

export interface HealthCheckResult {
  name: string
  ok: boolean
  latencyMs: number
  detail?: string
}

export interface HealthReport {
  status: 'ok' | 'degraded'
  checks: HealthCheckResult[]
}

export type HealthCheck = () => Promise<{ ok: boolean; detail?: string }>

const CHECK_TIMEOUT_MS = 3_000

export class HealthCheckRegistry {
  private readonly checks = new Map<string, HealthCheck>()

  register(name: string, check: HealthCheck): void {
    if (this.checks.has(name)) throw new Error(`health check already registered: ${name}`)
    this.checks.set(name, check)
  }

  async run(): Promise<HealthReport> {
    const results: HealthCheckResult[] = []
    for (const [name, check] of this.checks) {
      const started = Date.now()
      try {
        const outcome = await withTimeout(check(), CHECK_TIMEOUT_MS)
        results.push({ name, ok: outcome.ok, latencyMs: Date.now() - started, ...(outcome.detail ? { detail: outcome.detail } : {}) })
      } catch (error) {
        results.push({ name, ok: false, latencyMs: Date.now() - started, detail: (error as Error).message })
      }
    }
    return { status: results.every((r) => r.ok) ? 'ok' : 'degraded', checks: results }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`health check timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

export function dbHealthCheck(pool: pg.Pool): HealthCheck {
  return async () => {
    await pool.query('SELECT 1')
    return { ok: true }
  }
}

/** Every registered projection table must exist (ADR-004 C5 monitoring). */
export function projectionsHealthCheck(registry: ProjectionRegistry, pool: pg.Pool): HealthCheck {
  return async () => {
    const missing: string[] = []
    for (const definition of registry.list()) {
      const { rows } = await pool.query<{ t: string | null }>('SELECT to_regclass($1) AS t', [definition.name])
      if (rows[0]?.t === null) missing.push(definition.name)
    }
    return missing.length === 0
      ? { ok: true }
      : { ok: false, detail: `missing projection tables: ${missing.join(', ')}` }
  }
}
