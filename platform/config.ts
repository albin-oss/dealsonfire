/**
 * Platform configuration (IMP-PLT-001): typed environment readers, feature flags, and the
 * canonical timeout/limit defaults. Secrets stay in the deployment platform's env store
 * (Vercel) — DOF deliberately has no secret-manager of its own; this module is the single
 * sanctioned way to READ configuration (no scattered process.env access in domains).
 */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') throw new Error(`required environment variable missing: ${name}`)
  return value
}

export function optionalEnv(name: string, fallback = ''): string {
  return process.env[name] ?? fallback
}

export function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed)) throw new Error(`environment variable ${name} must be an integer, got "${raw}"`)
  return parsed
}

export function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.toLowerCase()
  if (raw === undefined) return fallback
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'off'].includes(raw)) return false
  throw new Error(`environment variable ${name} must be boolean-like, got "${raw}"`)
}

/**
 * Feature flags port. Env-backed day one (DOF_FLAG_<NAME>=true); a remote provider
 * (Vercel flags, LaunchDarkly-class) becomes an adapter later. Flags gate ROLLOUT;
 * capabilities gate ENTITLEMENT (merchant registry, ADR-001 §8) — different concerns,
 * deliberately different systems.
 */
export interface FeatureFlags {
  isEnabled(flag: string): boolean
}

export class EnvFeatureFlags implements FeatureFlags {
  isEnabled(flag: string): boolean {
    if (!/^[a-z0-9_]+$/.test(flag)) throw new Error(`invalid flag name: ${flag}`)
    return boolEnv(`DOF_FLAG_${flag.toUpperCase()}`, false)
  }
}

/** Canonical operational defaults (ADR-004 rule 22 budgets live in contracts; these are knobs). */
export const PLATFORM_DEFAULTS = {
  dbPoolMax: 10,
  commandTimeoutMs: 10_000,
  queryApiTimeoutMs: 3_000,
  outboxBatchLimit: 50,
  outboxMaxAttempts: 10,
  idempotencyReclaimSeconds: 60,
  healthCheckTimeoutMs: 3_000,
} as const
