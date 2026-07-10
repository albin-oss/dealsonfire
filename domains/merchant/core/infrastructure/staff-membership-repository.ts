import type { Tx, StaffMembershipRepository } from '../domain/ports'
import { StaffMembership, type PrincipalType, type MembershipStatus } from '../domain/staff-membership'
import { asBusinessId, asMembershipId, type BusinessId } from '../../shared-kernel/ids'
import type { Role } from '../../shared-kernel/permissions'
import { asClient } from '@platform/db'

interface Row {
  id: string
  business_id: string
  principal_type: PrincipalType
  principal_id: string
  roles: string[]
  store_scope: string[] | null
  ai_policy: Record<string, unknown> | null
  status: MembershipStatus
  invited_by: string | null
  invited_at: Date | null
  accepted_at: Date | null
  revoked_at: Date | null
  expires_at: Date | null
}

const COLUMNS = 'id, business_id, principal_type, principal_id, roles, store_scope, ai_policy, status, invited_by, invited_at, accepted_at, revoked_at, expires_at'

const rehydrate = (row: Row): StaffMembership =>
  StaffMembership.rehydrate({
    id: asMembershipId(row.id),
    businessId: asBusinessId(row.business_id),
    principalType: row.principal_type,
    principalId: row.principal_id,
    roles: row.roles as Role[],
    storeScope: row.store_scope,
    aiPolicy: row.ai_policy,
    status: row.status,
    invitedBy: row.invited_by ? asMembershipId(row.invited_by) : null,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    expiresAt: row.expires_at,
  })

export class PgStaffMembershipRepository implements StaffMembershipRepository {
  async findActiveForUser(tx: Tx, businessId: BusinessId, userId: string): Promise<StaffMembership | null> {
    const { rows } = await asClient(tx).query<Row>(
      `SELECT ${COLUMNS} FROM staff_memberships
       WHERE business_id = $1 AND principal_type = 'user' AND principal_id = $2 AND status = 'active'`,
      [businessId, userId],
    )
    return rows[0] ? rehydrate(rows[0]) : null
  }

  async listActiveByPrincipal(tx: Tx, principalId: string): Promise<StaffMembership[]> {
    const { rows } = await asClient(tx).query<Row>(
      `SELECT ${COLUMNS} FROM staff_memberships
       WHERE principal_id = $1 AND status = 'active' ORDER BY created_at`,
      [principalId],
    )
    return rows.map(rehydrate)
  }

  async insert(tx: Tx, m: StaffMembership): Promise<void> {
    await asClient(tx).query(
      `INSERT INTO staff_memberships
         (id, business_id, principal_type, principal_id, roles, store_scope, ai_policy, status, invited_by, invited_at, accepted_at, revoked_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [m.id, m.businessId, m.principalType, m.principalId, [...m.roles], m.storeScope ? [...m.storeScope] : null,
       m.aiPolicy, m.status, m.invitedBy, m.invitedAt, m.acceptedAt, m.revokedAt, m.expiresAt],
    )
  }

  async update(tx: Tx, m: StaffMembership): Promise<void> {
    await asClient(tx).query(
      `UPDATE staff_memberships SET roles = $2, store_scope = $3, ai_policy = $4, status = $5,
         accepted_at = $6, revoked_at = $7, expires_at = $8
       WHERE id = $1`,
      [m.id, [...m.roles], m.storeScope ? [...m.storeScope] : null, m.aiPolicy, m.status,
       m.acceptedAt, m.revokedAt, m.expiresAt],
    )
  }
}
