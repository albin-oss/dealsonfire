/**
 * The triple command gate (ADR-001 §5.6, BLUEPRINT-001 §9) — the domain's security spine.
 * Every command passes, in order: RBAC → Entitlement → Trust/Standing (+ step-up for
 * sensitive ops). One implementation; there are no per-endpoint bespoke checks and no AI side door.
 */
import { type Result, ok, err } from '../../../shared/result'
import { type DomainError, domainError } from '../../../shared/errors'
import type { Actor } from './actor'
import { type Permission, type GrantMode, grantFor, grantSatisfies } from './permissions'
import {
  type TrustLevel, type Standing, type ScaleTier,
  meetsTrust, WRITE_BLOCKING_STANDINGS,
} from './trust'

export interface CommandSpec {
  /** Audit/command name, e.g. 'merchant.store.publish' */
  command: string
  permission?: Permission
  /** Minimum grant mode required; 'full' unless the command is itself a draft action. */
  mode?: GrantMode
  /** Capability key (BLUEPRINT §5) the business must be entitled to. */
  capability?: string
  /** Minimum trust level (Progressive Trust — rarely needed; capabilities carry trust). */
  minTrust?: TrustLevel
  /** Standings that block this command. Defaults to WRITE_BLOCKING_STANDINGS. */
  blockedStandings?: readonly Standing[]
  /** Sensitive commands require step-up authentication (BLUEPRINT §9). */
  sensitivity?: 'normal' | 'sensitive'
}

export interface MembershipView {
  readonly id: string
  readonly roles: readonly string[]
  readonly status: 'invited' | 'active' | 'suspended' | 'revoked'
  readonly storeScope: readonly string[] | null
  readonly expiresAt: Date | null
}

export interface BusinessView {
  readonly id: string
  readonly trustLevel: TrustLevel
  readonly scaleTier: ScaleTier
  readonly standing: Standing
}

export interface GateContext {
  actor: Actor
  membership: MembershipView | null
  business: BusinessView | null
  /** Resolved by EntitlementService; null when the command has no capability requirement. */
  effectiveCapabilities: ReadonlySet<string> | null
  /** Store the command targets, if store-scoped (checked against membership.storeScope). */
  storeId?: string
  /** Fresh step-up assertion from Identity (≤5 min); required for sensitive commands. */
  stepUpVerified?: boolean
  now?: Date
}

export function authorize(ctx: GateContext, spec: CommandSpec): Result<void, DomainError> {
  const now = ctx.now ?? new Date()

  // ——— Gate 1: RBAC — may this actor?
  if (spec.permission) {
    const m = ctx.membership
    if (!m || m.status !== 'active') {
      return err(domainError('PERMISSION_DENIED', 'no active membership for this business'))
    }
    if (m.expiresAt && m.expiresAt <= now) {
      return err(domainError('PERMISSION_DENIED', 'membership has expired'))
    }
    if (ctx.storeId && m.storeScope && !m.storeScope.includes(ctx.storeId)) {
      return err(domainError('PERMISSION_DENIED', 'membership is not scoped to this store'))
    }
    const granted = grantFor(m.roles, spec.permission)
    if (!grantSatisfies(granted, spec.mode ?? 'full')) {
      return err(domainError('PERMISSION_DENIED', `requires ${spec.permission} (${spec.mode ?? 'full'})`))
    }
  }

  // ——— Gate 2: Entitlement — may this business?
  if (spec.capability) {
    if (!ctx.effectiveCapabilities?.has(spec.capability)) {
      return err(domainError('CAPABILITY_MISSING', `business is not entitled to ${spec.capability}`, { capability: spec.capability }))
    }
  }

  // ——— Gate 3: Trust/Standing — may they NOW?
  if (ctx.business) {
    const blocked = spec.blockedStandings ?? WRITE_BLOCKING_STANDINGS
    if (blocked.includes(ctx.business.standing)) {
      return err(domainError('STANDING_BLOCKED', `standing "${ctx.business.standing}" blocks this operation`))
    }
    if (spec.minTrust && !meetsTrust(ctx.business.trustLevel, spec.minTrust)) {
      return err(domainError('TRUST_LEVEL_REQUIRED', `requires trust level ${spec.minTrust}`, { required: spec.minTrust }))
    }
  }

  // ——— Step-up for sensitive operations
  if (spec.sensitivity === 'sensitive' && !ctx.stepUpVerified) {
    return err(domainError('STEP_UP_REQUIRED', 'this operation requires recent re-authentication'))
  }

  return ok(undefined)
}
