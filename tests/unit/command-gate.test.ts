import { describe, it, expect } from 'vitest'
import { authorize, type GateContext } from '@domains/merchant/shared-kernel/command-gate'
import { GROWTH_BLOCKING_STANDINGS } from '@domains/merchant/shared-kernel/trust'
import { grantFor } from '@domains/merchant/shared-kernel/permissions'

const base = (overrides: Partial<GateContext> = {}): GateContext => ({
  actor: { type: 'user', id: 'u1' },
  membership: { id: 'm1', roles: ['owner'], status: 'active', storeScope: null, expiresAt: null },
  business: { id: 'b1', trustLevel: 'unverified', scaleTier: 'starter', standing: 'good' },
  effectiveCapabilities: new Set(['store.core']),
  ...overrides,
})

describe('triple command gate — order: RBAC → Entitlement → Trust/Standing', () => {
  it('passes a well-formed owner command', () => {
    expect(authorize(base(), { command: 'x', permission: 'store.publish', capability: 'store.core' }).ok).toBe(true)
  })

  it('gate 1: no membership → PERMISSION_DENIED', () => {
    const result = authorize(base({ membership: null }), { command: 'x', permission: 'store.create' })
    expect(!result.ok && result.error.code).toBe('PERMISSION_DENIED')
  })

  it('gate 1: staff lacks store.create', () => {
    const ctx = base({ membership: { id: 'm', roles: ['staff'], status: 'active', storeScope: null, expiresAt: null } })
    const result = authorize(ctx, { command: 'x', permission: 'store.create' })
    expect(!result.ok && result.error.code).toBe('PERMISSION_DENIED')
  })

  it('gate 1: draft grant does not satisfy full mode (AI can draft, not publish)', () => {
    const ctx = base({ membership: { id: 'm', roles: ['ai_assistant'], status: 'active', storeScope: null, expiresAt: null } })
    expect(authorize(ctx, { command: 'x', permission: 'catalog.product.write', mode: 'draft' }).ok).toBe(true)
    const full = authorize(ctx, { command: 'x', permission: 'catalog.product.write' })
    expect(!full.ok && full.error.code).toBe('PERMISSION_DENIED')
  })

  it('gate 1: store scope enforced', () => {
    const ctx = base({
      membership: { id: 'm', roles: ['manager'], status: 'active', storeScope: ['s1'], expiresAt: null },
      storeId: 's2',
    })
    const result = authorize(ctx, { command: 'x', permission: 'store.publish' })
    expect(!result.ok && result.error.code).toBe('PERMISSION_DENIED')
  })

  it('gate 1: expired membership (time-boxed Support Agent) denied', () => {
    const ctx = base({
      membership: { id: 'm', roles: ['support_agent'], status: 'active', storeScope: null, expiresAt: new Date(Date.now() - 1000) },
    })
    const result = authorize(ctx, { command: 'x', permission: 'store.view', mode: 'read' })
    expect(!result.ok && result.error.code).toBe('PERMISSION_DENIED')
  })

  it('gate 2: missing capability → CAPABILITY_MISSING', () => {
    const result = authorize(base(), { command: 'x', permission: 'store.create', capability: 'stores.multiple' })
    expect(!result.ok && result.error.code).toBe('CAPABILITY_MISSING')
  })

  it('gate 3: suspended standing blocks writes', () => {
    const ctx = base({ business: { id: 'b1', trustLevel: 'unverified', scaleTier: 'starter', standing: 'suspended' } })
    const result = authorize(ctx, { command: 'x', permission: 'store.create' })
    expect(!result.ok && result.error.code).toBe('STANDING_BLOCKED')
  })

  it('gate 3: restricted blocks growth ops but not normal writes (ADR §6)', () => {
    const ctx = base({ business: { id: 'b1', trustLevel: 'unverified', scaleTier: 'starter', standing: 'restricted' } })
    expect(authorize(ctx, { command: 'x', permission: 'catalog.product.write' }).ok).toBe(true)
    const publish = authorize(ctx, { command: 'x', permission: 'store.publish', blockedStandings: GROWTH_BLOCKING_STANDINGS })
    expect(!publish.ok && publish.error.code).toBe('STANDING_BLOCKED')
  })

  it('gate 3: trust minimum enforced', () => {
    const result = authorize(base(), { command: 'x', permission: 'store.create', minTrust: 'identity_verified' })
    expect(!result.ok && result.error.code).toBe('TRUST_LEVEL_REQUIRED')
  })

  it('step-up required for sensitive commands', () => {
    const denied = authorize(base(), { command: 'x', permission: 'business.transfer', sensitivity: 'sensitive' })
    expect(!denied.ok && denied.error.code).toBe('STEP_UP_REQUIRED')
    expect(authorize(base({ stepUpVerified: true }), { command: 'x', permission: 'business.transfer', sensitivity: 'sensitive' }).ok).toBe(true)
  })
})

describe('AI hard guardrails (ADR §13.3) — not configurable, absent from the matrix', () => {
  it.each(['finance.payout_config', 'staff.invite', 'staff.manage_roles', 'business.transfer', 'business.close'] as const)(
    'ai_assistant has NO grant for %s at any mode',
    (permission) => {
      expect(grantFor(['ai_assistant'], permission)).toBeNull()
    },
  )
})
