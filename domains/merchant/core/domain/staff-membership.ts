/**
 * StaffMembership aggregate (ADR-001 §5.1) — a grant of authority: (principal, business) → roles.
 * Principals are users OR ai_agents (ADR §5.8-6). The exactly-one-Owner invariant is
 * double-enforced: here for domain clarity, and by a partial unique index in migration 0001.
 */
import { type Result, ok, err } from '../../../../shared/result'
import { type DomainError, domainError } from '../../../../shared/errors'
import { type BusinessId, type MembershipId, newMembershipId } from '../../shared-kernel/ids'
import { type Role, ROLES } from '../../shared-kernel/permissions'
import type { Actor } from '../../shared-kernel/actor'
import { type NewDomainEvent, EVENT, makeEvent } from './events'

export type PrincipalType = 'user' | 'ai_agent'
export type MembershipStatus = 'invited' | 'active' | 'suspended' | 'revoked'

export interface StaffMembershipProps {
  id: MembershipId
  businessId: BusinessId
  principalType: PrincipalType
  principalId: string
  roles: Role[]
  storeScope: string[] | null
  aiPolicy: Record<string, unknown> | null
  status: MembershipStatus
  invitedBy: MembershipId | null
  invitedAt: Date | null
  acceptedAt: Date | null
  revokedAt: Date | null
  expiresAt: Date | null
}

export class StaffMembership {
  private pending: NewDomainEvent[] = []

  private constructor(private readonly props: StaffMembershipProps) {}

  static rehydrate(props: StaffMembershipProps): StaffMembership {
    return new StaffMembership(props)
  }

  /** The founding Owner membership — created active, business-wide, by the system. */
  static createOwner(businessId: BusinessId, userId: string, actor: Actor): StaffMembership {
    const membership = new StaffMembership({
      id: newMembershipId(),
      businessId,
      principalType: 'user',
      principalId: userId,
      roles: ['owner'],
      storeScope: null,
      aiPolicy: null,
      status: 'active',
      invitedBy: null,
      invitedAt: null,
      acceptedAt: new Date(),
      revokedAt: null,
      expiresAt: null,
    })
    membership.pending.push(makeEvent(
      EVENT.STAFF_JOINED,
      { type: 'staff_membership', id: membership.props.id },
      businessId,
      actor,
      { membership_id: membership.props.id, business_id: businessId, principal_type: 'user', principal_id: userId, roles: ['owner'] },
    ))
    return membership
  }

  static create(input: {
    businessId: BusinessId
    principalType: PrincipalType
    principalId: string
    roles: string[]
    storeScope?: string[] | null
    invitedBy?: MembershipId | null
    expiresAt?: Date | null
    aiPolicy?: Record<string, unknown> | null
  }): Result<StaffMembership, DomainError> {
    if (input.roles.length === 0) {
      return err(domainError('VALIDATION_FAILED', 'membership requires at least one role'))
    }
    const invalid = input.roles.filter((r) => !ROLES.includes(r as Role))
    if (invalid.length) {
      return err(domainError('VALIDATION_FAILED', `unknown roles: ${invalid.join(', ')}`))
    }
    if (input.roles.includes('owner')) {
      // Owners are created by createOwner (founding) or OwnershipTransferService — never by invite.
      return err(domainError('VALIDATION_FAILED', 'the owner role cannot be granted by invitation'))
    }
    if (input.principalType === 'ai_agent' && input.roles.some((r) => r !== 'ai_assistant')) {
      return err(domainError('VALIDATION_FAILED', 'ai_agent principals may only hold the ai_assistant role'))
    }
    return ok(new StaffMembership({
      id: newMembershipId(),
      businessId: input.businessId,
      principalType: input.principalType,
      principalId: input.principalId,
      roles: input.roles as Role[],
      storeScope: input.storeScope ?? null,
      aiPolicy: input.aiPolicy ?? null,
      status: input.principalType === 'ai_agent' ? 'active' : 'invited',
      invitedBy: input.invitedBy ?? null,
      invitedAt: new Date(),
      acceptedAt: null,
      revokedAt: null,
      expiresAt: input.expiresAt ?? null,
    }))
  }

  get id() { return this.props.id }
  get businessId() { return this.props.businessId }
  get principalType() { return this.props.principalType }
  get principalId() { return this.props.principalId }
  get roles(): readonly Role[] { return this.props.roles }
  get storeScope(): readonly string[] | null { return this.props.storeScope }
  get aiPolicy() { return this.props.aiPolicy }
  get status() { return this.props.status }
  get invitedBy() { return this.props.invitedBy }
  get invitedAt() { return this.props.invitedAt }
  get acceptedAt() { return this.props.acceptedAt }
  get revokedAt() { return this.props.revokedAt }
  get expiresAt() { return this.props.expiresAt }

  get isOwner(): boolean {
    return this.props.roles.includes('owner')
  }

  revoke(): Result<void, DomainError> {
    if (this.isOwner) {
      // LAST_OWNER protection: ownership leaves only via OwnershipTransferService (ADR §12.3).
      return err(domainError('CONFLICT', 'the owner membership cannot be revoked; transfer ownership instead'))
    }
    if (this.props.status === 'revoked') return ok(undefined)
    this.props.status = 'revoked'
    this.props.revokedAt = new Date()
    return ok(undefined)
  }

  pullPendingEvents(): NewDomainEvent[] {
    const events = this.pending
    this.pending = []
    return events
  }
}
