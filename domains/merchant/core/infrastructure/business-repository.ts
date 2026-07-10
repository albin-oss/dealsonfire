import type { Tx, BusinessRepository } from '../domain/ports'
import { Business, type BusinessType } from '../domain/business'
import { asBusinessId, type BusinessId } from '../../shared-kernel/ids'
import type { TrustLevel, ScaleTier, Standing } from '../../shared-kernel/trust'
import { asClient } from '@platform/db'

interface Row {
  id: string
  business_type: BusinessType
  display_name: string
  profile: Record<string, unknown>
  trust_level: TrustLevel
  scale_tier: ScaleTier
  standing: Standing
  standing_context: Record<string, unknown>
  tax_settings: Record<string, unknown>
  closed_at: Date | null
}

const COLUMNS = 'id, business_type, display_name, profile, trust_level, scale_tier, standing, standing_context, tax_settings, closed_at'

const rehydrate = (row: Row): Business =>
  Business.rehydrate({
    id: asBusinessId(row.id),
    businessType: row.business_type,
    displayName: row.display_name,
    profile: row.profile,
    trustLevel: row.trust_level,
    scaleTier: row.scale_tier,
    standing: row.standing,
    standingContext: row.standing_context,
    taxSettings: row.tax_settings,
    closedAt: row.closed_at,
  })

export class PgBusinessRepository implements BusinessRepository {
  async findById(tx: Tx, id: BusinessId, opts?: { forUpdate?: boolean }): Promise<Business | null> {
    const { rows } = await asClient(tx).query<Row>(
      `SELECT ${COLUMNS} FROM businesses WHERE id = $1 AND deleted_at IS NULL${opts?.forUpdate ? ' FOR UPDATE' : ''}`,
      [id],
    )
    return rows[0] ? rehydrate(rows[0]) : null
  }

  async insert(tx: Tx, business: Business): Promise<void> {
    await asClient(tx).query(
      `INSERT INTO businesses (id, business_type, display_name, profile, trust_level, scale_tier, standing, standing_context, tax_settings, closed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [business.id, business.businessType, business.displayName, business.profile, business.trustLevel,
       business.scaleTier, business.standing, business.standingContext, business.taxSettings, business.closedAt],
    )
  }

  async update(tx: Tx, business: Business): Promise<void> {
    await asClient(tx).query(
      `UPDATE businesses SET display_name = $2, profile = $3, trust_level = $4, scale_tier = $5,
         standing = $6, standing_context = $7, tax_settings = $8, closed_at = $9
       WHERE id = $1`,
      [business.id, business.displayName, business.profile, business.trustLevel, business.scaleTier,
       business.standing, business.standingContext, business.taxSettings, business.closedAt],
    )
  }
}
